import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { FinancialTransaction } from "@/lib/models";
import { apiError } from "@/lib/records";
import { financeAttributes, FinancePayload, validateFinancePayload } from "@/lib/finance-records";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { rows } = await query(`
      SELECT id, type, description, category, counterparty, amount, status,
        transaction_date AS "transactionDate", payment_method AS "paymentMethod",
        attachment_url AS "attachmentUrl", attachment_name AS "attachmentName", notes
      FROM financial_transactions ORDER BY transaction_date DESC, created_at DESC
    `);
    return Response.json(rows);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as FinancePayload;
    const validationError = validateFinancePayload(payload);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const attributes = financeAttributes(payload);
    const id = await db.transaction(async (transaction) => {
      const record = await FinancialTransaction.create(attributes, { transaction });
      const action = attributes.type === "income" ? "registrou uma entrada de" : "registrou uma saída de";
      await addActivity(transaction, "financial", action, attributes.description);
      return record.id;
    });

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
