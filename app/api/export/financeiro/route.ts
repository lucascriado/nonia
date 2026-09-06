// Exportação do financeiro em CSV. Leitura: funciona em somente leitura.
//
// O CSV em si é montado por lib/finance-csv.ts, que é o mesmo gerador usado
// pela planilha que vai dentro do zip de comprovantes.
import { organizationId, requirePermission } from "@/lib/auth";
import { respostaCsv } from "@/lib/csv";
import { csvDoFinanceiro } from "@/lib/finance-csv";
import { filtrosDeFinanceiro } from "@/lib/listings";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("finance.read");
    const { searchParams } = new URL(request.url);

    // Excluído nunca sai em exportação: o construtor já cuida disso.
    const filtro = filtrosDeFinanceiro(searchParams, organizationId(auth));

    return respostaCsv(await csvDoFinanceiro(filtro), "financeiro", auth.organization.slug);
  } catch (error) {
    return apiError(error);
  }
}
