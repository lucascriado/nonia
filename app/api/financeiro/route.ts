import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { FinancialTransaction } from "@/lib/models";
import { apiError } from "@/lib/records";
import { filtrosDeFinanceiro, paginacao } from "@/lib/listings";
import { financeAttributes, FinancePayload, validateFinancePayload } from "@/lib/finance-records";
import { readJson } from "@/lib/http";

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

    const contagem = await query<{ total: number }>(
      `SELECT count(*)::int AS total FROM financial_transactions WHERE ${where}`,
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
        deleted_at AS "deletedAt",
        (SELECT full_name FROM users u WHERE u.id = financial_transactions.deleted_by) AS "deletedByName"
      FROM financial_transactions
      WHERE ${where}
      ORDER BY ${naLixeira ? "deleted_at DESC" : "transaction_date DESC, created_at DESC"}
      LIMIT $${filtro.valores.length + 1} OFFSET $${filtro.valores.length + 2}
    `, [...filtro.valores, pageSize, offset]);

    return Response.json({ records: rows, total: contagem.rows[0].total, page, pageSize });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("finance.write");
    const payload = await readJson<FinancePayload>(request);
    const validationError = validateFinancePayload(payload);
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
