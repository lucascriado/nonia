// Cancelamento do bypass: a organização volta ao plano gratuito e os tetos
// dele voltam a valer na leitura seguinte. Existe para o fluxo poder ser
// testado mais de uma vez.
import { organizationId, requirePermission } from "@/lib/auth";
import { assertBypassEnabled, cancelPlan } from "@/lib/billing-bypass";
import { addActivity } from "@/lib/activities";
import { db } from "@/lib/db";
import { planSnapshot } from "@/lib/plan-limits";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

export async function POST() {
  try {
    assertBypassEnabled();
    const auth = await requirePermission("billing.write");

    const anterior = await cancelPlan(auth);

    await db.transaction((transaction) =>
      addActivity(transaction, auth, "system", "cancelou o plano", anterior.planName),
    );

    return Response.json({ ok: true, plan: await planSnapshot(organizationId(auth)) });
  } catch (error) {
    return apiError(error);
  }
}
