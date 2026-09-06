// Usuários da organização: listagem, convite e criação direta.
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { badRequest, conflict, forbidden } from "@/lib/http";
import { Invitation, OrganizationMember, User } from "@/lib/models";
import { hashPassword, validatePasswordStrength } from "@/lib/passwords";
import { EMAIL_PATTERN, normalizeEmail } from "@/lib/organizations";
import {
  createInvitationToken,
  hashInvitationToken,
  INVITATION_TTL_DAYS,
  invitationUrl,
} from "@/lib/invitations";
import { apiError } from "@/lib/records";
import { assertBelongsToOrganization } from "@/lib/tenant";

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

    const [members, invitations] = await Promise.all([
      db.query(
        `SELECT u.id, u.full_name AS name, u.email, u.avatar_url AS "avatarUrl", u.status,
                u.last_login_at AS "lastLoginAt", om.person_id AS "personId",
                r.slug AS "roleSlug", r.name AS "roleName", om.joined_at AS "joinedAt"
         FROM organization_members om
         JOIN users u ON u.id = om.user_id
         JOIN roles r ON r.id = om.role_id
         WHERE om.organization_id = $1
         ORDER BY r.level DESC, u.full_name`,
        { bind: [organizationId(auth)], type: QueryTypes.SELECT },
      ),
      db.query(
        `SELECT i.id, i.email, i.full_name AS name, i.status, i.expires_at AS "expiresAt",
                r.slug AS "roleSlug", r.name AS "roleName"
         FROM invitations i
         JOIN roles r ON r.id = i.role_id
         WHERE i.organization_id = $1 AND i.status = 'pending' AND i.expires_at > now()
         ORDER BY i.created_at DESC`,
        { bind: [organizationId(auth)], type: QueryTypes.SELECT },
      ),
    ]);

    return Response.json({ users: members, invitations });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("users.write");
    const payload = (await request.json()) as CreateUserPayload;

    const email = payload.email ? normalizeEmail(payload.email) : "";
    const fullName = payload.fullName?.trim();
    const roleSlug = payload.roleSlug?.trim() || "leitura";

    if (!email || !EMAIL_PATTERN.test(email)) throw badRequest("Informe um e-mail válido.");
    // Só o proprietário promove outro proprietário.
    if (roleSlug === "owner" && auth.role.slug !== "owner") {
      throw forbidden("Apenas o proprietário pode conceder o papel de proprietário.", "missing_role");
    }

    const roles = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM roles
       WHERE slug = $1 AND (organization_id IS NULL OR organization_id = $2)
       ORDER BY organization_id NULLS LAST LIMIT 1`,
      { bind: [roleSlug, organizationId(auth)], type: QueryTypes.SELECT },
    );
    if (!roles.length) throw badRequest("Papel inválido.", "invalid_role");
    const role = roles[0];

    const existingUsers = await db.query<{ id: string; fullName: string }>(
      `SELECT id, full_name AS "fullName" FROM users WHERE lower(email) = $1`,
      { bind: [email], type: QueryTypes.SELECT },
    );
    const existingUser = existingUsers[0];

    if (existingUser) {
      const already = await db.query<{ user_id: string }>(
        `SELECT user_id FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
        { bind: [organizationId(auth), existingUser.id], type: QueryTypes.SELECT },
      );
      if (already.length) throw conflict("Este usuário já faz parte da organização.", "already_member");
    }

    // Com senha: cria/vincula o acesso na hora. Sem senha: gera convite.
    if (payload.password) {
      const passwordError = validatePasswordStrength(payload.password);
      if (passwordError) throw badRequest(passwordError, "weak_password");
      if (!existingUser && !fullName) throw badRequest("Informe o nome do usuário.");

      const passwordHash = await hashPassword(payload.password);

      const created = await db.transaction(async (transaction) => {
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
      // Reenviar convite substitui o pendente anterior (índice único parcial).
      await db.query(
        `UPDATE invitations SET status = 'revoked'
         WHERE organization_id = $1 AND lower(email) = $2 AND status = 'pending'`,
        { bind: [organizationId(auth), email], transaction },
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

    return Response.json(
      {
        id: invitation.id,
        email,
        name: fullName ?? null,
        roleSlug,
        status: "pending",
        expiresAt: expiresAt.toISOString(),
        // Ainda não há envio de e-mail: quem convidou repassa este link.
        inviteUrl: invitationUrl(request, token),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
