import { organizationId, requirePermission } from "@/lib/auth";
import { hojeNoFuso } from "@/lib/datas";
import { readJson } from "@/lib/http";
import { filtrosDeMembros, paginacao } from "@/lib/listings";
import { listarMembros, resumoDeMembros } from "@/lib/members/queries";
import { criarMembro } from "@/lib/members/service";
import { apiError, RecordPayload, validateRecordPayload } from "@/lib/records";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("members.read");
    const { searchParams } = new URL(request.url);

    // Filtro e paginação no SERVIDOR, e nesta ordem: filtra primeiro, pagina
    // depois. Paginar aqui e continuar filtrando na tela faria a busca olhar
    // só os 25 visíveis -- a pessoa digitaria um nome e não acharia ninguém,
    // sem desconfiar da paginação.
    const filtro = filtrosDeMembros(searchParams, organizationId(auth));
    const pagina = paginacao(searchParams);

    const { total, ...summary } = await resumoDeMembros(filtro, hojeNoFuso(auth.organization.timezone));
    const records = await listarMembros(filtro, pagina, {
      compromissos: searchParams.get("compromissos") === "1",
    });

    return Response.json({ records, total, page: pagina.page, pageSize: pagina.pageSize, summary });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("members.write");
    const payload = await readJson<RecordPayload>(request);
    const validationError = validateRecordPayload(payload);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const id = await criarMembro(auth, payload);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
