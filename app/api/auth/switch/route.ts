// Troca a organização ativa da sessão (usuário que atende mais de uma igreja).
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import {
  createSession,
  jsonWithCookie,
  requestMeta,
  requireSession,
  resolveSession,
  revokeSession,
  SESSION_COOKIE,
  sessionCookie,
} from "@/lib/auth";
import { cookies } from "next/headers";
import { sessionPayload } from "@/lib/auth-payloads";
import { badRequest, forbidden } from "@/lib/http";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireSession();
    const { organizationId, organizationSlug } = (await request.json()) as {
      organizationId?: string;
      organizationSlug?: string;
    };

    if (!organizationId && !organizationSlug) throw badRequest("Informe a organização de destino.");

    const rows = await db.query<{ id: string }>(
      `SELECT o.id
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1 AND om.status = 'active' AND o.status = 'active'
         AND ($2::uuid IS NULL OR o.id = $2::uuid)
         AND ($3::text IS NULL OR o.slug = $3::text)`,
      { bind: [auth.user.id, organizationId ?? null, organizationSlug ?? null], type: QueryTypes.SELECT },
    );

    if (!rows.length) throw forbidden("Você não tem acesso a esta igreja.", "organization_not_allowed");

    // Sessão nova em vez de UPDATE: o token antigo deixa de valer no ato.
    const previous = (await cookies()).get(SESSION_COOKIE)?.value;
    const session = await createSession(auth.user.id, rows[0].id, requestMeta(request));
    if (previous) await revokeSession(previous);

    const next = await resolveSession(session.token);
    if (!next) throw new Error("Sessão criada mas não pôde ser lida de volta.");

    return jsonWithCookie(sessionPayload(next), sessionCookie(session.token));
  } catch (error) {
    return apiError(error);
  }
}
