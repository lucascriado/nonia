// Usuários da organização: listagem, convite e criação direta.
import { Op, col, fn, where } from "sequelize";
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { badRequest, conflict, forbidden, readJson } from "@/lib/http";
import { Invitation, OrganizationMember, Role, User } from "@/lib/models";
import { hashPassword, validatePasswordStrength } from "@/lib/passwords";
import { EMAIL_PATTERN, normalizeEmail } from "@/lib/organizations";
import {
  createInvitationToken,
  hashInvitationToken,
  INVITATION_TTL_DAYS,
  invitationUrl,
} from "@/lib/invitations";
import { enviarEmail, templateConvite } from "@/lib/email";
import { apiError } from "@/lib/records";
import { assertBelongsToOrganization } from "@/lib/tenant";
import { assertWithinPlanLimit } from "@/lib/plan-limits";

export const runtime = "nodejs";

type CreateUserPayload = {
  email?: string;
  fullName?: string;
  roleSlug?: string;
  password?: string;
  personId?: string;
};

export async function GET() {
  try {
    const auth = await requirePermission("users.read");

    const [vinculos, convites] = await Promise.all([
      OrganizationMember.findAll({
        attributes: ["personId", "joinedAt"],
        where: { organizationId: organizationId(auth) },
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "fullName", "email", "avatarUrl", "status", "lastLoginAt"],
            required: true,
          },
          { model: Role, as: "role", attributes: ["slug", "name", "level"], required: true },
        ],
        order: [
          [{ model: Role, as: "role" }, "level", "DESC"],
          [{ model: User, as: "user" }, "fullName", "ASC"],
        ],
        raw: true,
        nest: true,
      }) as unknown as {
        personId: string | null;
        joinedAt: Date;
        user: { id: string; fullName: string; email: string; avatarUrl: string | null; status: string; lastLoginAt: Date | null };
        role: { slug: string; name: string };
      }[],
      // Só convites ainda válidos: pendentes e dentro do prazo, pelo relógio
      // do banco.
      Invitation.findAll({
        attributes: ["id", "email", "fullName", "status", "expiresAt"],
        where: { organizationId: organizationId(auth), status: "pending", expiresAt: { [Op.gt]: fn("now") } },
        include: [{ model: Role, as: "role", attributes: ["slug", "name"], required: true }],
        order: [["created_at", "DESC"]],
        raw: true,
        nest: true,
      }) as unknown as {
        id: string;
        email: string;
        fullName: string | null;
        status: string;
        expiresAt: Date;
        role: { slug: string; name: string };
      }[],
    ]);

    // As chaves (e a ordem delas) são as que a tela sempre recebeu.
    const members = vinculos.map(({ user, role, personId, joinedAt }) => ({
      id: user.id,
      name: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      personId,
      roleSlug: role.slug,
      roleName: role.name,
      joinedAt,
    }));
    const invitations = convites.map(({ role, fullName, ...convite }) => ({
      id: convite.id,
      email: convite.email,
      name: fullName,
      status: convite.status,
      expiresAt: convite.expiresAt,
      roleSlug: role.slug,
      roleName: role.name,
    }));

    return Response.json({ users: members, invitations });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("users.write");
    const payload = await readJson<CreateUserPayload>(request);

    const email = payload.email ? normalizeEmail(payload.email) : "";
    const fullName = payload.fullName?.trim();
    const roleSlug = payload.roleSlug?.trim() || "leitura";

    if (!email || !EMAIL_PATTERN.test(email)) throw badRequest("Informe um e-mail válido.");
    // Só o proprietário promove outro proprietário.
    if (roleSlug === "owner" && auth.role.slug !== "owner") {
      throw forbidden("Apenas o proprietário pode conceder o papel de proprietário.", "missing_role");
    }

    // Papel do sistema (organization_id nulo) ou próprio da igreja; havendo os
    // dois com o mesmo slug, o da igreja vem primeiro (ASC NULLS LAST).
    const role = await Role.findOne({
      attributes: ["id", "name"],
      where: {
        slug: roleSlug,
        [Op.or]: [{ organizationId: null }, { organizationId: organizationId(auth) }],
      },
      order: [["organizationId", "ASC NULLS LAST"]],
      raw: true,
    });
    if (!role) throw badRequest("Papel inválido.", "invalid_role");

    const existingUser = await User.findOne({
      attributes: ["id", "fullName"],
      where: where(fn("lower", col("email")), email),
      raw: true,
    });

    if (existingUser) {
      const already = await OrganizationMember.findOne({
        attributes: ["userId"],
        where: { organizationId: organizationId(auth), userId: existingUser.id },
        raw: true,
      });
      if (already) throw conflict("Este usuário já faz parte da organização.", "already_member");
    }

    // Com senha: cria/vincula o acesso na hora. Sem senha: gera convite.
    if (payload.password) {
      const passwordError = validatePasswordStrength(payload.password);
      if (passwordError) throw badRequest(passwordError, "weak_password");
      if (!existingUser && !fullName) throw badRequest("Informe o nome do usuário.");

      const passwordHash = await hashPassword(payload.password);

      const created = await db.transaction(async (transaction) => {
        await assertWithinPlanLimit(auth, "users", transaction);

        // A ficha de pessoa vinculada ao usuário tem que ser desta igreja: o
        // uuid vem do payload e a FK composta da 006 recusaria depois, com
        // erro de banco cru no meio do cadastro.
        if (payload.personId) {
          await assertBelongsToOrganization("people", "id", payload.personId, organizationId(auth), transaction);
        }

        const user =
          existingUser ??
          (await User.create(
            { email, fullName: fullName!, passwordHash, status: "active" },
            { transaction },
          ));

        await OrganizationMember.create(
          {
            organizationId: organizationId(auth),
            userId: user.id,
            roleId: role.id,
            personId: payload.personId || null,
            status: "active",
            isDefault: !existingUser,
            invitedBy: auth.user.id,
          },
          { transaction },
        );

        await addActivity(transaction, auth, "system", "adicionou o usuário", fullName ?? email, role.name);
        return user;
      });

      return Response.json(
        { id: created.id, email, name: fullName ?? existingUser?.fullName, roleSlug, status: "active" },
        { status: 201 },
      );
    }

    const token = createInvitationToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await db.transaction(async (transaction) => {
      // O convite pendente já ocupa assento, então é verificado na criação
      // dele e não no aceite -- quem foi convidado dentro do teto não leva
      // porta na cara depois de definir a senha.
      await assertWithinPlanLimit(auth, "users", transaction);

      // Reenviar convite substitui o pendente anterior (índice único parcial).
      await Invitation.update(
        { status: "revoked" },
        {
          where: {
            [Op.and]: [
              { organizationId: organizationId(auth) },
              where(fn("lower", col("email")), email),
              { status: "pending" },
            ],
          },
          transaction,
        },
      );

      const record = await Invitation.create(
        {
          organizationId: organizationId(auth),
          email,
          fullName: fullName || null,
          roleId: role.id,
          tokenHash: hashInvitationToken(token),
          status: "pending",
          invitedBy: auth.user.id,
          expiresAt,
        },
        { transaction },
      );

      await addActivity(transaction, auth, "system", "convidou", fullName ?? email, role.name);
      return record;
    });

    const url = invitationUrl(request, token);

    // DEPOIS do commit, e sem poder derrubar nada: o convite já existe. Se o
    // envio falhar -- sem chave, domínio não verificado, Resend fora do ar --
    // a resposta continua trazendo a inviteUrl para quem convidou repassar à
    // mão, que é exatamente como funcionava antes de existir e-mail.
    const envio = await enviarEmail({
      para: email,
      ...templateConvite({
        organizacao: auth.organization.name,
        papel: role.name,
        convidadoPor: auth.user.fullName,
        url,
        expiraEm: expiresAt,
      }),
    });

    return Response.json(
      {
        id: invitation.id,
        email,
        name: fullName ?? null,
        roleSlug,
        status: "pending",
        expiresAt: expiresAt.toISOString(),
        // Continua vindo mesmo quando o e-mail sai: é o caminho manual, e o
        // único quando o envio falha.
        inviteUrl: url,
        // Para a tela ser honesta: "convite enviado" ou "copie o link abaixo".
        emailSent: envio.enviado,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
