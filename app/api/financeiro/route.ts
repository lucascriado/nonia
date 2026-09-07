import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { FinancialTransaction } from "@/lib/models";
import { apiError } from "@/lib/records";
import { filtrosDeFinanceiro, paginacao } from "@/lib/listings";
import { financeAttributes, FinancePayload, validateFinancePayload } from "@/lib/finance-records";
import { readJson } from "@/lib/http";
import { FUSO_PADRAO } from "@/lib/datas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("finance.read");
    const { searchParams } = new URL(request.url);

    // ?deleted=1 é a lixeira. Ela precisa existir: sem caminho de volta pelo
    // produto, exclusão lógica é só uma coluna que ninguém alcança.
    const naLixeira = searchParams.get("deleted") === "1";
    const filtro = filtrosDeFinanceiro(searchParams, organizationId(auth), { incluirLixeira: naLixeira });
    const { page, pageSize, offset } = paginacao(searchParams);
    const where = filtro.where.join(" AND ");

    // Total E somatório na mesma consulta, com o MESMO filtro.
    //
    // O somatório vem daqui, e não da soma da lista na tela, porque com
    // paginação a lista é uma página: somar 25 de 137 daria um saldo errado
    // que continua parecendo certo. É o único ponto desta mudança que quebra
    // em silêncio -- os outros quebram alto, porque a resposta deixou de ser
    // array e a tela explode na hora.
    const resumo = await query<{
      total: number;
      income: string;
      expense: string;
      balance: string;
      pendingCount: number;
      pendingAmount: string;
    }>(
      `SELECT
         count(*)::int AS total,
         COALESCE(sum(amount) FILTER (WHERE type = 'income'  AND status = 'paid'), 0)::text AS income,
         COALESCE(sum(amount) FILTER (WHERE type = 'expense' AND status = 'paid'), 0)::text AS expense,
         (COALESCE(sum(amount) FILTER (WHERE type = 'income'  AND status = 'paid'), 0)
        - COALESCE(sum(amount) FILTER (WHERE type = 'expense' AND status = 'paid'), 0))::text AS balance,
         count(*) FILTER (WHERE status = 'pending')::int AS "pendingCount",
         COALESCE(sum(amount) FILTER (WHERE status = 'pending'), 0)::text AS "pendingAmount"
       FROM financial_transactions WHERE ${where}`,
      filtro.valores,
    );

    const { rows } = await query(`
      SELECT id, type, description, category, counterparty, amount, status,
        transaction_date AS "transactionDate", payment_method AS "paymentMethod",
        -- O anexo pode ter 2 MB por lançamento; um ano de comprovantes
        -- passaria de 100 MB numa requisição. A lista diz que existe e o nome
        -- do arquivo; o conteúdo sai pela rota do lançamento.
        attachment_url IS NOT NULL AS "hasAttachment",
        attachment_name AS "attachmentName", notes,
        retroactive,
        retroactive_reason AS "retroactiveReason",
        -- QUANDO FOI LANÇADO, no fuso da igreja. Sai de created_at, que é
        -- timestamptz -- um instante absoluto, gravado certo. É o par de
        -- transaction_date que torna o retroativo auditável: o dia do FATO e o
        -- dia do ATO, lado a lado, sem ninguém precisar deduzir nada.
        (created_at AT TIME ZONE $${filtro.valores.length + 3})::date AS "recordedOn",
        deleted_at AS "deletedAt",
        (SELECT full_name FROM users u WHERE u.id = financial_transactions.deleted_by) AS "deletedByName"
      FROM financial_transactions
      WHERE ${where}
      ORDER BY ${naLixeira ? "deleted_at DESC" : "transaction_date DESC, created_at DESC"}
      LIMIT $${filtro.valores.length + 1} OFFSET $${filtro.valores.length + 2}
    `, [...filtro.valores, pageSize, offset, auth.organization.timezone || FUSO_PADRAO]);

    const { total, ...summary } = resumo.rows[0];
    return Response.json({ records: rows, total, page, pageSize, summary });
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
      const action = attributes.type === "income" ? "registrou uma entrada de" : "registrou uma saída de";
      await addActivity(transaction, auth, "financial", action, attributes.description);
      return record.id;
    });

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
