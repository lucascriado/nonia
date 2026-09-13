import { Op, cast, col, fn, type WhereOptions } from "sequelize";
import { db } from "@/lib/db";


import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { FinancialTransaction, FinancialTransactionPayment, User } from "@/lib/models";
import { apiError } from "@/lib/records";
import { filtrosDeFinanceiro, paginacao } from "@/lib/listings";
import { financeAttributes, FinancePayload, parcelasDoPagamento, validateFinancePayload } from "@/lib/finance-records";
import { readJson } from "@/lib/http";
import { hojeNoFuso } from "@/lib/datas";

export const runtime = "nodejs";

/**
 * Soma de `amount` como TEXTO, do jeito que o Postgres escreve um numeric:
 * "150.00", ou "0" quando nada casa.
 *
 * Texto, e não número: `Model.sum` do Sequelize devolve float, e dinheiro em
 * float é o erro de centavo que aparece no fechamento do ano.
 */
async function somaDosValores(where: WhereOptions): Promise<string> {
  const linha = await FinancialTransaction.findOne({
    attributes: [[fn("COALESCE", fn("sum", col("amount")), 0), "soma"]],
    where,
    raw: true,
  }) as unknown as { soma: string | number } | null;
  return String(linha?.soma ?? "0");
}

/** `a - b` sobre dois valores em texto, em centavos inteiros -- sem float no meio. */
function subtrairValores(a: string, b: string): string {
  const CEM = BigInt(100);
  const centavos = (v: string) => {
    const [inteiro, fracao = ""] = v.split(".");
    const valor = BigInt(inteiro.replace("-", "")) * CEM + BigInt((fracao + "00").slice(0, 2));
    return inteiro.startsWith("-") ? -valor : valor;
  };
  const resultado = centavos(a) - centavos(b);
  // Mesma escala do Postgres: com casas decimais se algum dos lados tinha.
  if (!a.includes(".") && !b.includes(".")) return String(resultado / CEM);
  const negativo = resultado < BigInt(0);
  const absoluto = negativo ? -resultado : resultado;
  return `${negativo ? "-" : ""}${absoluto / CEM}.${String(absoluto % CEM).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("finance.read");
    const { searchParams } = new URL(request.url);

    // ?deleted=1 é a lixeira. Ela precisa existir: sem caminho de volta pelo
    // produto, exclusão lógica é só uma coluna que ninguém alcança.
    const naLixeira = searchParams.get("deleted") === "1";
    const filtro = filtrosDeFinanceiro(searchParams, organizationId(auth), { incluirLixeira: naLixeira });
    const { page, pageSize, offset } = paginacao(searchParams);
    const e = (condicao: object) => ({ [Op.and]: [filtro, condicao] });

    // Total E somatório com o MESMO filtro.
    //
    // O somatório vem daqui, e não da soma da lista na tela, porque com
    // paginação a lista é uma página: somar 25 de 137 daria um saldo errado
    // que continua parecendo certo. É o único ponto desta mudança que quebra
    // em silêncio -- os outros quebram alto, porque a resposta deixou de ser
    // array e a tela explode na hora.
    const pago = { status: "paid" };
    const [total, income, expense, pendingCount, pendingAmount] = await Promise.all([
      FinancialTransaction.count({ where: filtro }),
      somaDosValores(e({ ...pago, type: "income" })),
      somaDosValores(e({ ...pago, type: "expense" })),
      FinancialTransaction.count({ where: e({ status: "pending" }) }),
      somaDosValores(e({ status: "pending" })),
    ]);
    const summary = { income, expense, balance: subtrairValores(income, expense), pendingCount, pendingAmount };

    const linhas = await FinancialTransaction.findAll({
      attributes: [
        "id", "type", "description", "category", "counterparty", "amount", "status",
        "transactionDate", "paymentMethod",
        // O anexo pode ter 2 MB por lançamento; um ano de comprovantes passaria
        // de 100 MB numa requisição. A lista diz que existe e o nome do
        // arquivo; o conteúdo sai pela rota do lançamento.
        [cast(fn("num_nonnulls", col("attachment_url")), "boolean"), "hasAttachment"],
        "attachmentName", "notes", "retroactive", "retroactiveReason",
        "created_at", "deletedAt", "deletedBy",
      ],
      where: filtro,
      order: naLixeira ? [["deletedAt", "DESC"]] : [["transactionDate", "DESC"], ["created_at", "DESC"]],
      limit: pageSize,
      offset,
      raw: true,
    }) as unknown as (FinancialTransaction & { hasAttachment: boolean; created_at: Date })[];

    // Quem excluiu, pelo nome. Só existe na lixeira, então a busca só acontece lá.
    const idsDeQuemExcluiu = [...new Set(linhas.map((l) => l.deletedBy).filter((id): id is string => Boolean(id)))];
    const nomes = new Map(
      idsDeQuemExcluiu.length
        ? (await User.findAll({ attributes: ["id", "fullName"], where: { id: idsDeQuemExcluiu }, raw: true }))
          .map((u) => [u.id, u.fullName])
        : [],
    );

    const records = linhas.map(({ created_at: criadoEm, deletedBy, ...linha }) => ({
      ...linha,
      // QUANDO FOI LANÇADO, no fuso da igreja. Sai de created_at, que é
      // timestamptz -- um instante absoluto, gravado certo. É o par de
      // transaction_date que torna o retroativo auditável: o dia do FATO e o
      // dia do ATO, lado a lado, sem ninguém precisar deduzir nada.
      recordedOn: hojeNoFuso(auth.organization.timezone, new Date(criadoEm)),
      deletedByName: deletedBy ? nomes.get(deletedBy) ?? null : null,
    }));

    return Response.json({ records, total, page, pageSize, summary });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("finance.write");
    const payload = await readJson<FinancePayload>(request);
    // O fuso da igreja, e não UTC: a regra do retroativo é inteirinha sobre
    // "hoje", e em Brasília o "hoje" de UTC está errado das 21h à meia-noite.
    // Ver lib/datas.ts.
    const validationError = validateFinancePayload(payload, auth.organization.timezone);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const attributes = financeAttributes(payload);
    const id = await db.transaction(async (transaction) => {
      const record = await FinancialTransaction.create(
        { ...attributes, organizationId: organizationId(auth) },
        { transaction },
      );
      // AS PARTES ENTRAM NA MESMA TRANSAÇÃO, e é isso que faz a garantia do
      // banco funcionar: a trigger é DIFERIDA e confere no COMMIT, quando o
      // lançamento e todas as partes já estão lá. Fora desta transação, a
      // primeira parte inserida seria uma soma que não fecha.
      const parcelas = parcelasDoPagamento(payload);
      if (parcelas) {
        for (const parcela of parcelas) {
          await FinancialTransactionPayment.create({
            organizationId: organizationId(auth),
            transactionId: record.id,
            paymentMethod: parcela.method,
            amount: parcela.amount,
          }, { transaction });
        }
      }

      const action = attributes.type === "income" ? "registrou uma entrada de" : "registrou uma saída de";
      await addActivity(transaction, auth, "financial", action, attributes.description);
      return record.id;
    });

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
