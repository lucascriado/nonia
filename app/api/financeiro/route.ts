import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { FinancialTransaction } from "@/lib/models";
import { apiError } from "@/lib/records";
import { financeAttributes, FinancePayload, validateFinancePayload } from "@/lib/finance-records";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("finance.read");

    // ?deleted=1 é a lixeira. Ela precisa existir: sem caminho de volta pelo
    // produto, exclusão lógica é só uma coluna que ninguém alcança, e o dado
    // fica igualmente perdido para quem usa.
    const naLixeira = new URL(request.url).searchParams.get("deleted") === "1";

    const { rows } = await query(`
      SELECT f.id, f.type, f.description, f.category, f.counterparty, f.amount, f.status,
        f.transaction_date AS "transactionDate", f.payment_method AS "paymentMethod",
        -- O anexo pode ter 2 MB por lançamento; um ano de comprovantes
        -- passaria de 100 MB numa requisição. A lista diz que existe e o nome
        -- do arquivo; o conteúdo sai pela rota do lançamento.
        f.attachment_url IS NOT NULL AS "hasAttachment",
        f.attachment_name AS "attachmentName", f.notes,
        deleted_at AS "deletedAt", excluidor.full_name AS "deletedByName"
      FROM financial_transactions f
      LEFT JOIN users excluidor ON excluidor.id = f.deleted_by
      WHERE f.organization_id = $1
        AND (CASE WHEN $2::boolean THEN f.deleted_at IS NOT NULL ELSE f.deleted_at IS NULL END)
      ORDER BY ${naLixeira ? "f.deleted_at DESC" : "f.transaction_date DESC, f.created_at DESC"}
    `, [organizationId(auth), naLixeira]);
    return Response.json(rows);
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
