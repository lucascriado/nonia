import { apiRequest, type SessionPlan } from "@/components/auth/session";

/** Um plano contratável. A avaliação não aparece aqui: o backend a exclui. */
export type BillingPlan = {
  slug: string;
  name: string;
  description: string;
  priceCents: number | null;
  currency: string;
  billingPeriod: string;
  maxMembers: number | null;
  maxUsers: number | null;
  features: Record<string, unknown>;
};

export type BillingPlans = {
  plans: BillingPlan[];
  current: SessionPlan;
  /**
   * Falso quando a contratação está desligada no ambiente (BILLING_BYPASS).
   * Aí as rotas de contratar e cancelar respondem 404 — não é erro, é a
   * contratação não existir ali, e a tela não deve oferecer o botão.
   */
  canSubscribe: boolean;
};

export function getBillingPlans() {
  return apiRequest<BillingPlans>("/api/billing/plans");
}

export function subscribeToPlan(planSlug: string) {
  return apiRequest<{ ok: true; plan: SessionPlan }>("/api/billing/subscribe", {
    method: "POST",
    body: JSON.stringify({ planSlug }),
  });
}

export function cancelSubscription() {
  return apiRequest<{ ok: true; plan: SessionPlan }>("/api/billing/cancel", { method: "POST" });
}

/** "R$ 89" / "Grátis" / "Sob consulta" — o preço vem em centavos. */
export function formatPrice(priceCents: number | null) {
  if (priceCents === null) return "Sob consulta";
  if (priceCents === 0) return "Grátis";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(priceCents / 100);
}

/** null = ilimitado, e ilimitado não tem percentual nem alerta. */
export function usageRatio(used: number, cap: number | null) {
  if (cap === null || cap <= 0) return null;
  return used / cap;
}
