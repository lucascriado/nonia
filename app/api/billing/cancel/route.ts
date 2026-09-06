// Cancelamento do bypass: a organização volta ao plano gratuito e os tetos
// dele voltam a valer na leitura seguinte. Existe para o fluxo poder ser
// testado mais de uma vez.
import { organizationId, requireBillingWriteEvenWhenReadOnly } from "@/lib/auth";
import { assertBypassEnabled, cancelPlan } from "@/lib/billing-bypass";
import { planSnapshot } from "@/lib/plan-limits";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

export async function POST() {
  try {
    assertBypassEnabled();
    // Sem a guarda de somente leitura, de propósito: cancelar é uma das duas
    // ações que tiram a igreja de lá, e barrá-la seria impasse. Ver o
    // docblock de requireBillingWriteEvenWhenReadOnly.
    const auth = await requireBillingWriteEvenWhenReadOnly();

    const anterior = await cancelPlan(auth);

    return Response.json({ ok: true, plan: await planSnapshot(organizationId(auth)) });
  } catch (error) {
    return apiError(error);
  }
}
