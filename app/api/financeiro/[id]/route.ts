import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { FinancialTransaction } from "@/lib/models";
import { apiError } from "@/lib/records";
import { assertAffected } from "@/lib/tenant";
import { financeAttributes, FinancePayload, validateFinancePayload } from "@/lib/finance-records";
import { notFound, readJson, requireUuid } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("finance.read");
    const { id } = await context.params;
    requireUuid(id, "Lançamento não encontrado.");

    // Com o comprovante, que a listagem não traz mais por peso.
    const { rows } = await query(`
      SELECT id, type, description, category, counterparty, amount, status,
        transaction_date AS "transactionDate", payment_method AS "paymentMethod",
        attachment_url AS "attachmentUrl", attachment_name AS "attachmentName", notes
      FROM financial_transactions
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
    `, [id, organizationId(auth)]);

    if (!rows.length) throw notFound("Lançamento não encontrado.");
    return Response.json(rows[0]);
  } catch (error) {
    return apiError(error);
  }
}


export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("finance.write");
    const { id } = await context.params;
    requireUuid(id, "Lançamento não encontrado.");
    const payload = await readJson<FinancePayload>(request);
    // Mesmo fuso da criação. Vale para a edição também, e é de propósito:
    // trocar a data de um lançamento para uma data passada é exatamente o ato
    // que a marca de retroativo existe para registrar -- deixar a edição de
    // fora seria um caminho por onde a data velha entra sem marca nenhuma.
    const validationError = validateFinancePayload(payload, auth.organization.timezone);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const attributes = financeAttributes(payload);
    await db.transaction(async (transaction) => {
      // Lançamento na lixeira não se edita: restaure primeiro.
      const [affected] = await FinancialTransaction.update(attributes, {
        where: { id, organizationId: organizationId(auth), deletedAt: null },
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
    requireUuid(id, "Lançamento não encontrado.");

    await db.transaction(async (transaction) => {
      const record = await FinancialTransaction.findOne({
        where: { id, organizationId: organizationId(auth), deletedAt: null },
        transaction,
      });
      if (!record) assertAffected(0, "Lançamento não encontrado.");

      // Marca, não remove. Dado contábil não some sem volta.
      await FinancialTransaction.update(
        { deletedAt: new Date(), deletedBy: auth.user.id },
        { where: { id, organizationId: organizationId(auth), deletedAt: null }, transaction },
      );
      await addActivity(transaction, auth, "financial", "excluiu o lançamento", record?.description);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
