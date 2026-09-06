// Exportação do financeiro em CSV. Leitura: funciona em somente leitura.
import { query } from "@/lib/db";
import { organizationId, requirePermission } from "@/lib/auth";
import { dataBR, montarCsv, respostaCsv, texto, valorBR } from "@/lib/csv";
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

    const { rows } = await query<Record<string, string | null>>(
      `SELECT transaction_date, type, description, category, counterparty, amount, status,
              payment_method, attachment_name, attachment_url IS NOT NULL AS tem_comprovante, notes
       FROM financial_transactions
       WHERE ${filtro.where.join(" AND ")}
       ORDER BY transaction_date DESC, created_at DESC`,
      filtro.valores,
    );

    // O comprovante vai como "Sim/Não" mais o nome do arquivo. O anexo em si é
    // base64 e faria a planilha pesar megabytes por linha.
    const csv = montarCsv(
      ["Data", "Tipo", "Descrição", "Categoria", "Contraparte", "Valor", "Status",
       "Forma de pagamento", "Comprovante", "Arquivo do comprovante", "Observações"],
      rows.map((r) => [
        texto(dataBR(r.transaction_date)),
        texto(r.type === "income" ? "Entrada" : "Saída"),
        texto(r.description), texto(r.category), texto(r.counterparty),
        texto(valorBR(r.amount)),
        texto(r.status === "paid" ? "Pago" : "Pendente"),
        texto(r.payment_method),
        texto(r.tem_comprovante ? "Sim" : "Não"),
        texto(r.attachment_name), texto(r.notes),
      ]),
    );

    return respostaCsv(csv, "financeiro", auth.organization.slug);
  } catch (error) {
    return apiError(error);
  }
}
