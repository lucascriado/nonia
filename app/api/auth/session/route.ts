// Sessão atual. Responde 200 mesmo sem sessão (authenticated: false) porque
// é a sondagem que a tela de login faz antes de decidir para onde ir.
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import { clearedSessionCookie, getSession, jsonWithCookie } from "@/lib/auth";
import { sessionPayload } from "@/lib/auth-payloads";
import { planSnapshot } from "@/lib/plan-limits";
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

    // O plano entra AQUI e não no requireSession de propósito: o banner de
    // avaliação precisa dele em toda tela, mas resolvê-lo em toda requisição
    // autenticada custaria uma consulta a mais em cada chamada de API. A tela
    // já busca /api/auth/session, então aqui ele vem de graça.
    const organizations = await db.query<{ id: string; name: string; slug: string; roleSlug: string }>(
      `SELECT o.id, o.name, o.slug, r.slug AS "roleSlug"
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       JOIN roles r ON r.id = om.role_id
       WHERE om.user_id = $1 AND om.status = 'active' AND o.status = 'active'
       ORDER BY om.is_default DESC, o.name`,
      { bind: [auth.user.id], type: QueryTypes.SELECT },
    );

    const plan = await planSnapshot(auth.organization.id);

    return Response.json({ ...sessionPayload(auth), organizations, plan });
  } catch (error) {
    // Organização suspensa chega aqui como HttpError e sai como 403.
    return apiError(error);
  }
}
