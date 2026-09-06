// Aceite de convite: cria (ou vincula) o usuário e já abre a sessão.
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { createSession, jsonWithCookie, requestMeta, resolveSession, sessionCookie } from "@/lib/auth";
import { sessionPayload } from "@/lib/auth-payloads";
import { badRequest, notFound, unauthorized } from "@/lib/http";
import { hashInvitationToken } from "@/lib/invitations";
import { Invitation, OrganizationMember, User } from "@/lib/models";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/passwords";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

type AcceptPayload = { token?: string; fullName?: string; password?: string };

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AcceptPayload;
    const token = payload.token?.trim();
    if (!token) throw badRequest("Convite não informado.", "invalid_invitation");
    if (!payload.password) throw badRequest("Informe a senha.");

    const invitations = await db.query<{
      id: string;
      organizationId: string;
      email: string;
      fullName: string | null;
      roleId: string;
      invitedBy: string | null;
      organizationName: string;
    }>(
      `SELECT i.id, i.organization_id AS "organizationId", i.email, i.full_name AS "fullName",
              i.role_id AS "roleId", i.invited_by AS "invitedBy", o.name AS "organizationName"
       FROM invitations i
       JOIN organizations o ON o.id = i.organization_id
       WHERE i.token_hash = $1 AND i.status = 'pending' AND i.expires_at > now()
         AND o.status = 'active'`,
      { bind: [hashInvitationToken(token)], type: QueryTypes.SELECT },
    );

    const invitation = invitations[0];
    if (!invitation) throw notFound("Convite não encontrado ou expirado.", "invalid_invitation");

    const existingUsers = await db.query<{ id: string; passwordHash: string | null; fullName: string }>(
      `SELECT id, password_hash AS "passwordHash", full_name AS "fullName"
       FROM users WHERE lower(email) = lower($1)`,
      { bind: [invitation.email], type: QueryTypes.SELECT },
    );
    const existingUser = existingUsers[0];

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
