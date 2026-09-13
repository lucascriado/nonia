// Aceite de convite: cria (ou vincula) o usuário e já abre a sessão.
import { Op, col, fn, where } from "sequelize";
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { createSession, jsonWithCookie, requestMeta, resolveSession, sessionCookie } from "@/lib/auth";
import { sessionPayload } from "@/lib/auth-payloads";
import { badRequest, notFound, readJson, unauthorized } from "@/lib/http";
import { hashInvitationToken } from "@/lib/invitations";
import { Invitation, Organization, OrganizationMember, User } from "@/lib/models";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/passwords";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

type AcceptPayload = { token?: string; fullName?: string; password?: string };

export async function POST(request: Request) {
  try {
    const payload = await readJson<AcceptPayload>(request);
    const token = payload.token?.trim();
    if (!token) throw badRequest("Convite não informado.", "invalid_invitation");
    if (!payload.password) throw badRequest("Informe a senha.");

    // Convite válido: pendente, dentro do prazo (pelo relógio do BANCO, como
    // sempre foi) e de uma igreja ativa -- INNER JOIN, `required: true`.
    const encontrado = await Invitation.findOne({
      attributes: ["id", "organizationId", "email", "fullName", "roleId", "invitedBy"],
      where: {
        tokenHash: hashInvitationToken(token),
        status: "pending",
        expiresAt: { [Op.gt]: fn("now") },
      },
      include: [{ model: Organization, as: "organization", attributes: ["name"], where: { status: "active" }, required: true }],
      raw: true,
      nest: true,
    }) as unknown as {
      id: string;
      organizationId: string;
      email: string;
      fullName: string | null;
      roleId: string;
      invitedBy: string | null;
      organization: { name: string };
    } | null;

    if (!encontrado) throw notFound("Convite não encontrado ou expirado.", "invalid_invitation");
    const { organization, ...dadosDoConvite } = encontrado;
    const invitation = { ...dadosDoConvite, organizationName: organization.name };

    // lower() dos DOIS lados, no banco: é a expressão do índice único, e a
    // conta de caixa do Postgres não é necessariamente a do JavaScript.
    const existingUser = await User.findOne({
      attributes: ["id", "passwordHash", "fullName"],
      where: where(fn("lower", col("email")), fn("lower", invitation.email)),
      raw: true,
    });

    // Quem já tem conta confirma com a senha atual; quem não tem, define uma.
    if (existingUser) {
      if (!(await verifyPassword(payload.password, existingUser.passwordHash))) {
        throw unauthorized("Senha incorreta para a conta deste e-mail.", "invalid_credentials");
      }
    } else {
      const passwordError = validatePasswordStrength(payload.password);
      if (passwordError) throw badRequest(passwordError, "weak_password");
      if (!payload.fullName?.trim() && !invitation.fullName) throw badRequest("Informe o seu nome completo.");
    }

    const meta = requestMeta(request);

    const session = await db.transaction(async (transaction) => {
      const fullName = payload.fullName?.trim() || invitation.fullName || existingUser?.fullName || invitation.email;

      const user =
        existingUser ??
        (await User.create(
          {
            email: invitation.email,
            fullName,
            passwordHash: await hashPassword(payload.password!),
            status: "active",
            emailVerifiedAt: new Date(),
            lastLoginAt: new Date(),
          },
          { transaction },
        ));

      const hasMembership = await OrganizationMember.count({
        where: { organizationId: invitation.organizationId, userId: user.id },
        transaction,
      });

      if (!hasMembership) {
        await OrganizationMember.create(
          {
            organizationId: invitation.organizationId,
            userId: user.id,
            roleId: invitation.roleId,
            status: "active",
            isDefault: !existingUser,
            invitedBy: invitation.invitedBy,
          },
          { transaction },
        );
      }

      await Invitation.update(
        { status: "accepted", acceptedAt: new Date(), acceptedUserId: user.id },
        { where: { id: invitation.id }, transaction },
      );

      await addActivity(
        transaction,
        { user: { id: user.id, fullName }, organization: { id: invitation.organizationId } },
        "system",
        "aceitou o convite para",
        invitation.organizationName,
      );

      return createSession(user.id, invitation.organizationId, meta, transaction);
    });

    const auth = await resolveSession(session.token);
    if (!auth) throw new Error("Sessão criada mas não pôde ser lida de volta.");

    return jsonWithCookie(sessionPayload(auth), sessionCookie(session.token), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
