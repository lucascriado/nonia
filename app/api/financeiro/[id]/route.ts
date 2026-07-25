import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { FinancialTransaction } from "@/lib/models";
import { apiError } from "@/lib/records";
import { financeAttributes, FinancePayload, validateFinancePayload } from "@/lib/finance-records";

export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = await request.json() as FinancePayload;
    const validationError = validateFinancePayload(payload);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const attributes = financeAttributes(payload);
    await db.transaction(async (transaction) => {
      await FinancialTransaction.update(attributes, { where: { id }, transaction });
      await addActivity(transaction, "financial", "atualizou o lançamento", attributes.description);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await db.transaction(async (transaction) => {
      const record = await FinancialTransaction.findByPk(id, { transaction });
      await FinancialTransaction.destroy({ where: { id }, transaction });
      await addActivity(transaction, "financial", "excluiu o lançamento", record?.description);
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
