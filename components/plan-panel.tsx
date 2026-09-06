"use client";

import { useEffect, useState } from "react";
import { Check, CreditCard, LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AuthError, type SessionPlan } from "@/components/auth/session";
import { cancelSubscription, formatPrice, getBillingPlans, subscribeToPlan, usageRatio, type BillingPlan } from "@/components/billing";
import { usePermission, useSession } from "@/components/current-user";

/** A partir daqui o teto deixa de ser informação e vira aviso. */
const WARN_AT = 0.8;

export function PlanPanel() {
  const session = useSession();
  const canManage = usePermission("billing.write");
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [canSubscribe, setCanSubscribe] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getBillingPlans()
      .then((data) => {
        if (!active) return;
        setPlans(data.plans);
        setCanSubscribe(data.canSubscribe);
        setPlan(data.current);
      })
      // Sem permissão de billing a rota recusa, e aí o painel some em vez de
      // mostrar erro: quem não pode contratar não precisa saber que falhou.
      .catch(() => active && setCanSubscribe(false))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  // O plano do GET sessão serve enquanto a lista não volta.
  const current = plan ?? session.plan;
  if (loading && !current) return null;
  if (!current) return null;

  async function run(action: () => Promise<{ plan: SessionPlan }>, id: string, ok: string) {
    setWorking(id);
    setConfirming(null);
    try {
      // As duas rotas devolvem o plano JÁ atualizado, então não refaço o GET
      // da sessão: teto, source e uso vêm na própria resposta.
      const result = await action();
      setPlan(result.plan);
      toast.success(ok);
    } catch (error) {
      toast.error(error instanceof AuthError ? error.message : "Não foi possível concluir a operação.");
    } finally {
      setWorking(null);
    }
  }

  const showActions = canManage && canSubscribe;
  const showPlans = plans.length > 0;

  return (
    <article className="plan-panel">
      <header>
        <span aria-hidden><CreditCard /></span>
        <div>
          <h3>Plano da igreja</h3>
          <p>{planSummary(current)}</p>
        </div>
        <strong className={`plan-badge is-${current.source}`}>{current.name}</strong>
      </header>

      <div className="plan-usage">
        <UsageBar label="Pessoas cadastradas" used={current.usage.members} cap={current.maxMembers} />
        <UsageBar label="Usuários com acesso" used={current.usage.users} cap={current.maxUsers} />
      </div>

      {showPlans && (
        <div className="plan-options">
          {plans.map((option) => {
            const isCurrent = option.slug === current.slug;
            return (
              <div className={`plan-option${isCurrent ? " is-current" : ""}`} key={option.slug}>
                <div>
                  <strong>{option.name}</strong>
                  <small>{option.description}</small>
                </div>
                <span className="plan-option-price">{formatPrice(option.priceCents)}</span>
                {isCurrent ? (
                  <span className="plan-option-current"><Check aria-hidden /> Plano atual</span>
                ) : !showActions ? null : confirming === option.slug ? (
                  <span className="plan-confirm">
                    <button onClick={() => setConfirming(null)} type="button">Voltar</button>
                    <button
                      className="primary-action"
                      disabled={working !== null}
                      onClick={() => run(() => subscribeToPlan(option.slug), option.slug, `Plano ${option.name} ativado.`)}
                      type="button"
                    >
                      {working === option.slug ? <LoaderCircle className="button-spinner" aria-hidden /> : null}
                      Confirmar
                    </button>
                  </span>
                ) : (
                  <button className="plan-option-action" disabled={working !== null} onClick={() => setConfirming(option.slug)} type="button">
                    Mudar para este
                  </button>
                )}
              </div>
            );
          })}

          {showActions && current.source !== "free" && (
            <div className="plan-cancel">
              {confirming === "cancel" ? (
                <>
                  <p>
                    <TriangleAlert aria-hidden />
                    {current.source === "trial"
                      ? "Cancelar encerra a avaliação agora e a conta passa para o Semente, com teto de 100 pessoas e 1 usuário. Não dá para voltar para a avaliação."
                      : "Cancelar encerra a assinatura e a conta passa para o Semente, com teto de 100 pessoas e 1 usuário."}
                  </p>
                  <span className="plan-confirm">
                    <button onClick={() => setConfirming(null)} type="button">Voltar</button>
                    <button
                      className="plan-cancel-confirm"
                      disabled={working !== null}
                      onClick={() => run(cancelSubscription, "cancel", "Assinatura encerrada. A conta está no plano Semente.")}
                      type="button"
                    >
                      {working === "cancel" ? <LoaderCircle className="button-spinner" aria-hidden /> : null}
                      Cancelar mesmo assim
                    </button>
                  </span>
                </>
              ) : (
                <button onClick={() => setConfirming("cancel")} type="button">
                  {current.source === "trial" ? "Encerrar avaliação" : "Cancelar assinatura"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function planSummary(plan: SessionPlan) {
  if (plan.source === "trial") {
    if (plan.trialExpired) return "A avaliação terminou. Escolha um plano para continuar com tudo liberado.";
    const days = plan.trialDaysLeft ?? 0;
    return days === 1 ? "Último dia de avaliação." : `Avaliação: faltam ${days} dias.`;
  }
  if (plan.source === "subscription") return "Assinatura ativa, cobrada por mês.";
  return "Plano gratuito, sem prazo para expirar.";
}

/**
 * Uso contra o teto. Avisa ANTES de encostar no limite — descobrir o teto
 * batendo nele é o que a barra existe para evitar.
 */
function UsageBar({ label, used, cap }: { label: string; used: number; cap: number | null }) {
  const ratio = usageRatio(used, cap);
  const full = ratio !== null && ratio >= 1;
  const near = ratio !== null && ratio >= WARN_AT && !full;

  return (
    <div className={`plan-usage-row${full ? " is-full" : near ? " is-near" : ""}`}>
      <span className="plan-usage-label">
        {label}
        <strong>{cap === null ? `${used} · ilimitado` : `${used} de ${cap}`}</strong>
      </span>
      {ratio !== null && (
        <span className="plan-usage-track" role="presentation">
          <i style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
        </span>
      )}
      {full && <small><TriangleAlert aria-hidden /> Você atingiu o limite do plano.</small>}
      {near && <small>Faltam {cap! - used} para o limite do plano.</small>}
    </div>
  );
}
