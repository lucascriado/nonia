import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { FinancialTransaction } from "@/lib/models";
import { apiError } from "@/lib/records";
import { assertAffected } from "@/lib/tenant";
import { financeAttributes, FinancePayload, validateFinancePayload } from "@/lib/finance-records";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("finance.write");
    const { id } = await context.params;
    const payload = await readJson<FinancePayload>(request);
    const validationError = validateFinancePayload(payload);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const attributes = financeAttributes(payload);
    await db.transaction(async (transaction) => {
      const [affected] = await FinancialTransaction.update(attributes, {
        where: { id, organizationId: organizationId(auth) },
        transaction,
      });
      assertAffected(affected, "Lançamento não encontrado.");
      await addActivity(transaction, auth, "financial", "atualizou o lançamento", attributes.description);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("finance.write");
    const { id } = await context.params;

    await db.transaction(async (transaction) => {
      const record = await FinancialTransaction.findOne({
        where: { id, organizationId: organizationId(auth) },
        transaction,
      });
      if (!record) assertAffected(0, "Lançamento não encontrado.");

      await FinancialTransaction.destroy({
        where: { id, organizationId: organizationId(auth) },
        transaction,
      });
      await addActivity(transaction, auth, "financial", "excluiu o lançamento", record?.description);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
