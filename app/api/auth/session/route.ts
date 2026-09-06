// Sessão atual. Responde 200 mesmo sem sessão (authenticated: false) porque
// é a sondagem que a tela de login faz antes de decidir para onde ir.
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import { clearedSessionCookie, getSession, jsonWithCookie } from "@/lib/auth";
import { sessionPayload } from "@/lib/auth-payloads";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await getSession();

    if (!auth) {
      // Limpa um cookie órfão (sessão revogada ou expirada) de uma vez.
      return jsonWithCookie({ authenticated: false }, clearedSessionCookie());
    }

    const organizations = await db.query<{ id: string; name: string; slug: string; roleSlug: string }>(
      `SELECT o.id, o.name, o.slug, r.slug AS "roleSlug"
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       JOIN roles r ON r.id = om.role_id
       WHERE om.user_id = $1 AND om.status = 'active' AND o.status = 'active'
       ORDER BY om.is_default DESC, o.name`,
      { bind: [auth.user.id], type: QueryTypes.SELECT },
    );

    return Response.json({ ...sessionPayload(auth), organizations });
  } catch (error) {
    // Organização suspensa chega aqui como HttpError e sai como 403.
    return apiError(error);
  }
}
