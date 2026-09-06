// Consulta pública de um convite: a tela /convite/[token] mostra igreja,
// e-mail e papel antes de pedir a senha.
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import { notFound } from "@/lib/http";
import { hashInvitationToken } from "@/lib/invitations";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token")?.trim();
    if (!token) throw notFound("Convite não encontrado ou expirado.", "invalid_invitation");

    const rows = await db.query<{
      email: string;
      fullName: string | null;
      organizationName: string;
      roleName: string;
      expiresAt: Date;
      hasAccount: boolean;
    }>(
      `SELECT i.email, i.full_name AS "fullName", o.name AS "organizationName",
              r.name AS "roleName", i.expires_at AS "expiresAt",
              EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(i.email)) AS "hasAccount"
       FROM invitations i
       JOIN organizations o ON o.id = i.organization_id
       JOIN roles r ON r.id = i.role_id
       WHERE i.token_hash = $1 AND i.status = 'pending' AND i.expires_at > now()`,
      { bind: [hashInvitationToken(token)], type: QueryTypes.SELECT },
    );

    if (!rows.length) throw notFound("Convite não encontrado ou expirado.", "invalid_invitation");

    return Response.json(rows[0]);
  } catch (error) {
    return apiError(error);
  }
}
