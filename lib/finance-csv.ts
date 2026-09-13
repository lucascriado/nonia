import { cast, col, fn } from "sequelize";
// O CSV do financeiro, num lugar só.
//
// Existe porque o mesmo arquivo é entregue por dois caminhos: o download
// avulso (/api/export/financeiro) e a planilha dentro do zip de comprovantes.
// Se cada um montasse o seu, as duas versões divergiriam no dia em que alguém
// mexesse numa coluna -- e a divergência apareceria só para quem baixou pelo
// outro caminho. É o mesmo motivo de os filtros terem ido para lib/listings.ts.

import { dataBR, montarCsv, texto, valorBR } from "@/lib/csv";
import type { Filtro } from "@/lib/listings";
import { FinancialTransaction } from "@/lib/models";

/** Monta o CSV dos lançamentos que casam com o filtro. */
export async function csvDoFinanceiro(filtro: Filtro): Promise<string> {
  const rows = await FinancialTransaction.findAll({
    attributes: [
      "transactionDate", "type", "description", "category", "counterparty", "amount", "status",
      "paymentMethod", "attachmentName", "notes",
      [cast(fn("num_nonnulls", col("attachment_url")), "boolean"), "temComprovante"],
    ],
    where: filtro,
    order: [["transactionDate", "DESC"], ["created_at", "DESC"]],
    raw: true,
  }) as unknown as (FinancialTransaction & { temComprovante: boolean })[];

  // O comprovante vai como "Sim/Não" mais o nome do arquivo. O anexo em si é
  // base64 e faria a planilha pesar megabytes por linha.
  return montarCsv(
    ["Data", "Tipo", "Descrição", "Categoria", "Contraparte", "Valor", "Status",
     "Forma de pagamento", "Comprovante", "Arquivo do comprovante", "Observações"],
    rows.map((r) => [
      texto(dataBR(r.transactionDate)),
      texto(r.type === "income" ? "Entrada" : "Saída"),
      texto(r.description), texto(r.category), texto(r.counterparty),
      texto(valorBR(r.amount)),
      texto(r.status === "paid" ? "Pago" : "Pendente"),
      texto(r.paymentMethod),
      texto(r.temComprovante ? "Sim" : "Não"),
      texto(r.attachmentName), texto(r.notes),
    ]),
  );
}
