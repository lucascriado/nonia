// Exportação do financeiro em CSV. Leitura: funciona em somente leitura.
import { query } from "@/lib/db";
import { organizationId, requirePermission } from "@/lib/auth";
import { dataBR, montarCsv, normalizar, respostaCsv, texto, valorBR } from "@/lib/csv";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPO = { Entrada: "income", "Saída": "expense", income: "income", expense: "expense" };
const STATUS = { Pago: "paid", Pendente: "pending", paid: "paid", pending: "pending" };

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("finance.read");
    const { searchParams } = new URL(request.url);

    const busca = searchParams.get("search")?.trim() || null;
    const tipo = normalizar(searchParams.get("type"), TIPO);
    const status = normalizar(searchParams.get("status"), STATUS);
    const categoria = searchParams.get("category");
    const comprovante = searchParams.get("attachment");

    const valores: unknown[] = [organizationId(auth)];
    // Excluído não sai em exportação nem em relatório.
    const filtros = ["organization_id = $1", "deleted_at IS NULL"];
    if (busca) {
      valores.push(`%${busca}%`);
      filtros.push(`concat_ws(' ', description, counterparty) ILIKE $${valores.length}`);
    }
    if (tipo) { valores.push(tipo); filtros.push(`type = $${valores.length}`); }
    if (status) { valores.push(status); filtros.push(`status = $${valores.length}`); }
    if (categoria && categoria !== "all") { valores.push(categoria); filtros.push(`category = $${valores.length}`); }
    if (comprovante === "with") filtros.push("attachment_url IS NOT NULL");
    else if (comprovante === "without") filtros.push("attachment_url IS NULL");

    const { rows } = await query<Record<string, string | null>>(
      `SELECT transaction_date, type, description, category, counterparty, amount, status,
              payment_method, attachment_name, attachment_url IS NOT NULL AS tem_comprovante, notes
       FROM financial_transactions
       WHERE ${filtros.join(" AND ")}
       ORDER BY transaction_date DESC, created_at DESC`,
      valores,
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
