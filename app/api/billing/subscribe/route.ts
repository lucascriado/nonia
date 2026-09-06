// Contratação sem gateway. Ver o cabeçalho de lib/billing-bypass.ts: isto é
// caminho de desenvolvimento e sai inteiro quando o pagamento real entrar.
import { organizationId, requireBillingWriteEvenWhenReadOnly } from "@/lib/auth";
import { activatePlan, assertBypassEnabled } from "@/lib/billing-bypass";
import { addActivity } from "@/lib/activities";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { planSnapshot } from "@/lib/plan-limits";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertBypassEnabled();
    // billing.write é só do proprietário: nem o administrador contrata.
    // Sem a guarda de somente leitura, de propósito: contratar é uma das duas
    // ações que tiram a igreja de lá, e barrá-la seria impasse. Ver o
    // docblock de requireBillingWriteEvenWhenReadOnly.
    const auth = await requireBillingWriteEvenWhenReadOnly();

    const { planSlug } = (await request.json()) as { planSlug?: string };
    if (!planSlug?.trim()) throw badRequest("Informe o plano.", "invalid_plan");

    const plano = await activatePlan(auth, planSlug.trim());

    await db.transaction((transaction) =>
      addActivity(transaction, auth, "system", "contratou o plano", plano.name),
    );

    return Response.json({ ok: true, plan: await planSnapshot(organizationId(auth)) });
  } catch (error) {
    return apiError(error);
  }
}
