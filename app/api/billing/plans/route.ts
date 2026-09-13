// Planos que a igreja pode contratar. Vem do banco, e não de constante no
// código, para o preço e o teto mostrados na tela serem os mesmos que o
// backend aplica -- essa divergência já apareceu uma vez, entre a landing e o
// plano atribuído no cadastro.
import { requirePermission } from "@/lib/auth";
import { Plan } from "@/lib/models";
import { planSnapshot } from "@/lib/plan-limits";
import { bypassEnabled } from "@/lib/billing-bypass";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requirePermission("billing.read", "billing.write");

    // `trialDays: 0` tira a avaliação: ela não se contrata.
    const plans = await Plan.findAll({
      attributes: [
        "slug", "name", "description", "priceCents", "currency",
        "billingPeriod", "maxMembers", "maxUsers", "features",
      ],
      where: { isActive: true, trialDays: 0 },
      order: [["sortOrder", "ASC"]],
      raw: true,
    });

    return Response.json({
      plans,
      current: await planSnapshot(auth.organization.id),
      // A tela só mostra o botão de contratar quando há como contratar.
      canSubscribe: bypassEnabled(),
    });
  } catch (error) {
    return apiError(error);
  }
}
