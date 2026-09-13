// Troca a organização ativa da sessão (usuário que atende mais de uma igreja).
import { Organization, OrganizationMember } from "@/lib/models";
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
import { badRequest, forbidden, readJson } from "@/lib/http";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireSession();
    const { organizationId, organizationSlug } = await readJson<{
      organizationId?: string;
      organizationSlug?: string;
    }>(request);

    if (!organizationId && !organizationSlug) throw badRequest("Informe a organização de destino.");

    // Só TEXTO chega ao `where`: no Sequelize um array vira `IN (...)`. Com
    // SQL cru, id que não fosse texto estourava no cast para uuid (500), e
    // slug que não fosse texto não casava com igreja nenhuma (403).
    if (organizationId != null && typeof organizationId !== "string") {
      throw new Error("organizationId inválido na troca de organização.");
    }
    if (organizationSlug != null && typeof organizationSlug !== "string") {
      throw forbidden("Você não tem acesso a esta igreja.", "organization_not_allowed");
    }

    // Id e slug, quando vierem os dois, têm que apontar para a MESMA igreja.
    const destino: { status: string; id?: string; slug?: string } = { status: "active" };
    if (organizationId != null) destino.id = organizationId;
    if (organizationSlug != null) destino.slug = organizationSlug;

    const vinculo = await OrganizationMember.findOne({
      attributes: ["organizationId"],
      where: { userId: auth.user.id, status: "active" },
      include: [{ model: Organization, as: "organization", attributes: ["id"], where: destino, required: true }],
    }) as (OrganizationMember & { organization: Organization }) | null;

    if (!vinculo) throw forbidden("Você não tem acesso a esta igreja.", "organization_not_allowed");

    // Sessão nova em vez de UPDATE: o token antigo deixa de valer no ato.
    const previous = (await cookies()).get(SESSION_COOKIE)?.value;
    const session = await createSession(auth.user.id, vinculo.organization.id, requestMeta(request));
    if (previous) await revokeSession(previous);

    const next = await resolveSession(session.token);
    if (!next) throw new Error("Sessão criada mas não pôde ser lida de volta.");

    return jsonWithCookie(sessionPayload(next), sessionCookie(session.token));
  } catch (error) {
    return apiError(error);
  }
}
