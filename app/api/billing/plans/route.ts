// Planos que a igreja pode contratar. Vem do banco, e não de constante no
// código, para o preço e o teto mostrados na tela serem os mesmos que o
// backend aplica -- essa divergência já apareceu uma vez, entre a landing e o
// plano atribuído no cadastro.
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { planSnapshot } from "@/lib/plan-limits";
import { bypassEnabled } from "@/lib/billing-bypass";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requirePermission("billing.read", "billing.write");

    const plans = await db.query(
      `SELECT slug, name, description, price_cents AS "priceCents", currency,
              billing_period AS "billingPeriod", max_members AS "maxMembers",
              max_users AS "maxUsers", features
       FROM plans
       WHERE is_active AND trial_days = 0
       ORDER BY sort_order`,
      { type: QueryTypes.SELECT },
    );

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
