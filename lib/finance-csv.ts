// O CSV do financeiro, num lugar só.
//
// Existe porque o mesmo arquivo é entregue por dois caminhos: o download
// avulso (/api/export/financeiro) e a planilha dentro do zip de comprovantes.
// Se cada um montasse o seu, as duas versões divergiriam no dia em que alguém
// mexesse numa coluna -- e a divergência apareceria só para quem baixou pelo
// outro caminho. É o mesmo motivo de os filtros terem ido para lib/listings.ts.

import { query } from "@/lib/db";
import { dataBR, montarCsv, texto, valorBR } from "@/lib/csv";
import type { Filtro } from "@/lib/listings";

/** Monta o CSV dos lançamentos que casam com o filtro. */
export async function csvDoFinanceiro(filtro: Filtro): Promise<string> {
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
  return montarCsv(
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
}
