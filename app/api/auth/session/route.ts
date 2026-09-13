// Sessão atual. Responde 200 mesmo sem sessão (authenticated: false) porque
// é a sondagem que a tela de login faz antes de decidir para onde ir.
import { clearedSessionCookie, getSession, jsonWithCookie } from "@/lib/auth";
import { sessionPayload } from "@/lib/auth-payloads";
import { Organization, OrganizationMember, Role } from "@/lib/models";
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
    const vinculos = await OrganizationMember.findAll({
      attributes: [],
      where: { userId: auth.user.id, status: "active" },
      include: [
        {
          model: Organization,
          as: "organization",
          attributes: ["id", "name", "slug", "timezone"],
          where: { status: "active" },
          required: true,
        },
        { model: Role, as: "role", attributes: ["slug"], required: true },
      ],
      order: [["isDefault", "DESC"], [{ model: Organization, as: "organization" }, "name", "ASC"]],
      raw: true,
      nest: true,
    }) as unknown as {
      organization: { id: string; name: string; slug: string; timezone: string };
      role: { slug: string };
    }[];
    const organizations = vinculos.map(({ organization, role }) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      timezone: organization.timezone,
      roleSlug: role.slug,
    }));

    const plan = await planSnapshot(auth.organization.id);

    return Response.json({ ...sessionPayload(auth), organizations, plan });
  } catch (error) {
    // Organização suspensa chega aqui como HttpError e sai como 403.
    return apiError(error);
  }
}
