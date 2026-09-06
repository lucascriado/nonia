// Máquina de estados da assinatura, e o nível de acesso que ela concede.
//
// Este arquivo é o ÚNICO lugar onde os estados, as transições permitidas e a
// carência existem. Nada de `if (status === "past_due")` espalhado por rota.
//
// Dois conceitos que não se misturam:
//
//   ESTADO da assinatura  -> o que está contratado (subscriptions.status)
//   NÍVEL DE ACESSO       -> o que a igreja pode fazer AGORA, derivado do
//                            estado mais a data. Calculado na leitura, como o
//                            plano efetivo, porque não há tarefa agendada.
//
// Não pagar NUNCA tranca a igreja para fora dos próprios dados. O pior estado
// é somente leitura: consultar, buscar e levar o que é seu continua valendo.

import { QueryTypes, type Transaction } from "sequelize";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";

export const SUBSCRIPTION_STATUSES = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Transições permitidas. O webhook do gateway consulta esta tabela antes de
 * gravar, para um evento fora de ordem (o Mercado Pago reenvia, e nem sempre
 * na ordem em que aconteceu) não conseguir ressuscitar uma assinatura
 * cancelada nem rebaixar uma que já foi paga.
 */
export const ALLOWED_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  // Cobrança criada, ainda não confirmada.
  incomplete: ["active", "canceled", "expired"],
  // Avaliação em curso: vira paga, é cancelada, ou o prazo acaba.
  trialing: ["active", "canceled", "expired"],
  // Paga e em dia.
  active: ["past_due", "canceled", "expired"],
  // Venceu e não foi paga.
  past_due: ["active", "canceled", "expired"],
  // Cancelada pela igreja; volta se ela reassinar.
  canceled: ["active"],
  // Prazo esgotado; volta se ela assinar.
  expired: ["active"],
};

export const canTransition = (from: SubscriptionStatus, to: SubscriptionStatus) =>
  from === to || ALLOWED_TRANSITIONS[from].includes(to);

/** Dias de tolerância depois do vencimento antes de virar somente leitura. */
export const GRACE_DAYS = 7;

export type AccessLevel = "full" | "grace" | "read_only";

export type SubscriptionRow = {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  planSlug: string;
  planName: string;
  maxMembers: number | null;
  maxUsers: number | null;
};

export type Access = {
  level: AccessLevel;
  /** Quando a carência acaba e o acesso vira somente leitura. */
  graceEndsAt: string | null;
  graceDaysLeft: number | null;
  /** Nome do plano em atraso, para a mensagem. */
  pastDuePlan: string | null;
};

/**
 * Carrega a assinatura vigente. `lock` trava a linha (ou a da organização, na
 * falta dela) para serializar escritas concorrentes da mesma igreja.
 */
export async function loadSubscription(
  organization: string,
  options: { lock?: boolean; transaction?: Transaction } = {},
): Promise<SubscriptionRow | null> {
  const { lock = false, transaction } = options;

  const rows = await db.query<SubscriptionRow>(
    `SELECT s.status, s.trial_ends_at AS "trialEndsAt", s.current_period_end AS "currentPeriodEnd",
            p.slug AS "planSlug", p.name AS "planName",
            p.max_members AS "maxMembers", p.max_users AS "maxUsers"
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.organization_id = $1
       AND s.status IN ('trialing', 'active', 'past_due', 'incomplete')
     ${lock ? "FOR UPDATE OF s" : ""}`,
    { bind: [organization], transaction, type: QueryTypes.SELECT },
  );

  if (lock && !rows[0]) {
    await db.query(`SELECT 1 FROM organizations WHERE id = $1 FOR UPDATE`, {
      bind: [organization],
      transaction,
      type: QueryTypes.SELECT,
    });
  }

  return rows[0] ?? null;
}

/**
 * Nível de acesso, derivado do estado e da data. Função pura.
 *
 * Somente leitura vem de DÍVIDA, não de ausência de plano pago: quem cancela
 * ou deixa a avaliação vencer cai para o plano gratuito e continua
 * escrevendo dentro do teto dele. Quem tem cobrança vencida é que perde a
 * escrita, e só depois da carência.
 */
export function resolveAccess(subscription: SubscriptionRow | null): Access {
  const livre: Access = { level: "full", graceEndsAt: null, graceDaysLeft: null, pastDuePlan: null };

  if (!subscription || subscription.status !== "past_due") return livre;

  // Sem data de vencimento não dá para contar carência. Nesse caso a igreja
  // fica na carência e nunca é trancada por falta de dado nosso.
  if (!subscription.currentPeriodEnd) {
    return { level: "grace", graceEndsAt: null, graceDaysLeft: null, pastDuePlan: subscription.planName };
  }

  const fimDaCarencia = new Date(subscription.currentPeriodEnd);
  fimDaCarencia.setDate(fimDaCarencia.getDate() + GRACE_DAYS);

  const restante = fimDaCarencia.getTime() - Date.now();

  return {
    level: restante > 0 ? "grace" : "read_only",
    graceEndsAt: fimDaCarencia.toISOString(),
    graceDaysLeft: restante > 0 ? Math.max(0, Math.ceil(restante / 86_400_000)) : 0,
    pastDuePlan: subscription.planName,
  };
}

const dataCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;

/**
 * Recusa a escrita quando a igreja está em somente leitura.
 *
 * A mensagem é deliberadamente diferente da de teto de plano: são situações
 * distintas e misturá-las faria a pessoa tentar a solução errada.
 */
export async function assertWritable(organization: string, transaction?: Transaction) {
  const acesso = resolveAccess(await loadSubscription(organization, { transaction }));
  if (acesso.level !== "read_only") return;

  const desde = dataCurta(acesso.graceEndsAt);

  throw new HttpError(
    402,
    `O pagamento do plano ${acesso.pastDuePlan} está em atraso e a igreja entrou em modo somente leitura` +
      `${desde ? ` em ${desde}` : ""}. ` +
      "Você continua consultando, buscando e exportando tudo, e nada foi apagado. " +
      "Para voltar a cadastrar e editar, regularize o pagamento.",
    "subscription_read_only",
    { access: acesso.level, graceEndsAt: acesso.graceEndsAt, plan: acesso.pastDuePlan },
  );
}
