// CONTRATAÇÃO SEM GATEWAY -- "clica e ganha o plano".
//
// O QUE É: a igreja escolhe um plano, e a assinatura passa a valer na hora.
// Não há Mercado Pago, QR, boleto, webhook nem credencial. A linha em
// `subscriptions` é criada como paga, e o plano efetivo passa a ser o
// contratado na leitura seguinte.
//
// POR QUE EXISTE: o nonia roda localmente. Não há URL pública para receber
// webhook de pagamento, e o que se quer ver agora é o fluxo funcionando ponta
// a ponta. Trocar gateway real por bypass saiu barato porque o schema é
// agnóstico ao gateway -- as colunas provider* guardam o id externo e o
// domínio nunca soube o nome de ninguém.
//
// O QUE ISTO É, SEM EUFEMISMO: uma porta dos fundos. Qualquer pessoa
// autenticada com billing.write se promove sozinha para o plano pago. Num
// ambiente local isso é inofensivo; no dia em que existir hospedagem, é uma
// falha de cobrança. Por isso:
//
//   * exige BILLING_BYPASS=1 no ambiente, e vem DESLIGADO por padrão;
//   * recusa em produção AINDA QUE a variável esteja ligada, e grita no log;
//   * marca provider = 'bypass' em tudo que cria, para uma assinatura assim
//     jamais ser confundida com pagamento recebido, nem por quem lê o banco
//     nem por relatório futuro;
//   * não cria nenhuma linha em `subscription_payments`: não houve pagamento.
//
// O QUE PRECISA ACONTECER PARA ISTO SAIR: a integração de pagamento de
// verdade entrar no lugar. Aí este arquivo e as rotas de app/api/billing são
// apagados inteiros, e a máquina de estados de lib/subscription-state.ts --
// que não sabe que este bypass existe -- continua igual.

import { randomUUID } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import { db } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/http";
import { canTransition, loadSubscription, type SubscriptionStatus } from "@/lib/subscription-state";
import type { AuthContext } from "@/lib/auth";

// NÃO REMOVA ISTO ACHANDO QUE É REDUNDANTE.
//
// O bypass cria a assinatura com status 'active' direto, sem passar por
// 'trialing', porque o efeito pedido é "clicou, adquiriu" -- passar pela
// avaliação atrasaria em 14 dias exatamente o que se quer ver.
//
// A consequência é que a regra 1 de resolveEffectivePlan ("assinatura paga
// vigente vence tudo") passa a valer sem que pagamento nenhum tenha existido.
// Ou seja: O STATUS NÃO DISTINGUE uma assinatura paga de uma assinatura dada.
// `provider = 'bypass'` e a linha em `billing_events` são a ÚNICA coisa que
// separa as duas no banco. Quem for somar faturamento um dia depende disso
// para não contar como receita algo que ninguém pagou.
export const BYPASS_PROVIDER = "bypass";

/** Ligado só com BILLING_BYPASS=1 e fora de produção. */
export function bypassEnabled() {
  const ligado = process.env.BILLING_BYPASS === "1" || process.env.BILLING_BYPASS === "true";
  if (!ligado) return false;

  if (process.env.NODE_ENV === "production") {
    console.error(
      "[billing] BILLING_BYPASS está ligado em produção e foi IGNORADO. " +
        "Contratação sem gateway é caminho de desenvolvimento; em produção ela " +
        "deixaria qualquer usuário se promover ao plano pago sem pagar. " +
        "Remova a variável do ambiente.",
    );
    return false;
  }

  return true;
}

/** As rotas de bypass não existem quando ele está desligado. */
export function assertBypassEnabled() {
  if (!bypassEnabled()) {
    throw notFound("Recurso indisponível.", "not_found");
  }
}

type PlanRow = { id: string; slug: string; name: string; billingPeriod: string; trialDays: number };

function fimDoPeriodo(billingPeriod: string): Date | null {
  const fim = new Date();
  if (billingPeriod === "yearly") fim.setFullYear(fim.getFullYear() + 1);
  else if (billingPeriod === "monthly") fim.setMonth(fim.getMonth() + 1);
  else return null; // lifetime não vence
  return fim;
}

async function registrarEvento(
  tipo: string,
  auth: AuthContext,
  payload: Record<string, unknown>,
  transaction: Transaction,
) {
  await db.query(
    `INSERT INTO billing_events (provider, provider_event_id, type, organization_id, payload, processed_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, now())`,
    {
      bind: [
        BYPASS_PROVIDER,
        randomUUID(),
        tipo,
        auth.organization.id,
        JSON.stringify({ ...payload, byUserId: auth.user.id, byUserName: auth.user.fullName }),
      ],
      transaction,
    },
  );
}

/** Ativa o plano escolhido, na hora. */
export async function activatePlan(auth: AuthContext, planSlug: string) {
  const planos = await db.query<PlanRow>(
    `SELECT id, slug, name, billing_period AS "billingPeriod", trial_days AS "trialDays"
     FROM plans WHERE slug = $1 AND is_active`,
    { bind: [planSlug], type: QueryTypes.SELECT },
  );
  const plano = planos[0];
  if (!plano) throw notFound("Plano não encontrado.", "invalid_plan");
  if (plano.trialDays > 0) {
    throw badRequest("Não é possível contratar o período de avaliação.", "invalid_plan");
  }

  return db.transaction(async (transaction) => {
    const atual = await loadSubscription(auth.organization.id, { lock: true, transaction });

    if (atual) {
      if (!canTransition(atual.status as SubscriptionStatus, "active")) {
        throw conflict(
          `Uma assinatura em "${atual.status}" não pode ser ativada diretamente.`,
          "invalid_transition",
        );
      }
      if (atual.status === "active" && atual.planSlug === plano.slug) {
        throw conflict("A igreja já está neste plano.", "already_subscribed");
      }
    }

    const fim = fimDoPeriodo(plano.billingPeriod);
    // Prefixo no id externo além do provider: quem inspecionar a linha vê a
    // origem nos dois campos, mesmo lendo só um deles.
    const externo = `${BYPASS_PROVIDER}:${randomUUID()}`;

    if (atual) {
      // Só uma assinatura vigente por organização (índice único parcial), então
      // contratar troca a linha existente em vez de criar outra.
      await db.query(
        `UPDATE subscriptions
         SET plan_id = $2, status = 'active', started_at = now(),
             current_period_start = now(), current_period_end = $3,
             cancel_at_period_end = false, canceled_at = NULL, ended_at = NULL,
             provider = $4, provider_subscription_id = $5
         WHERE organization_id = $1
           AND status IN ('trialing', 'active', 'past_due', 'incomplete')`,
        { bind: [auth.organization.id, plano.id, fim, BYPASS_PROVIDER, externo], transaction },
      );
    } else {
      await db.query(
        `INSERT INTO subscriptions
           (organization_id, plan_id, status, started_at, current_period_start, current_period_end,
            provider, provider_subscription_id)
         VALUES ($1, $2, 'active', now(), now(), $3, $4, $5)`,
        { bind: [auth.organization.id, plano.id, fim, BYPASS_PROVIDER, externo], transaction },
      );
    }

    await registrarEvento(
      "subscription.activated",
      auth,
      { plan: plano.slug, previousStatus: atual?.status ?? null, previousPlan: atual?.planSlug ?? null },
      transaction,
    );

    return plano;
  });
}

/** Cancela a assinatura vigente; a organização volta ao plano gratuito. */
export async function cancelPlan(auth: AuthContext) {
  return db.transaction(async (transaction) => {
    const atual = await loadSubscription(auth.organization.id, { lock: true, transaction });
    if (!atual) throw conflict("Não há assinatura vigente para cancelar.", "no_subscription");
    if (!canTransition(atual.status as SubscriptionStatus, "canceled")) {
      throw conflict(`Uma assinatura em "${atual.status}" não pode ser cancelada.`, "invalid_transition");
    }

    await db.query(
      `UPDATE subscriptions
       SET status = 'canceled', canceled_at = now(), ended_at = now(), cancel_at_period_end = false
       WHERE organization_id = $1
         AND status IN ('trialing', 'active', 'past_due', 'incomplete')`,
      { bind: [auth.organization.id], transaction },
    );

    await registrarEvento(
      "subscription.canceled",
      auth,
      { plan: atual.planSlug, previousStatus: atual.status },
      transaction,
    );

    return atual;
  });
}
