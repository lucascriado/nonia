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

import { Transaction } from "sequelize";
import { HttpError } from "@/lib/http";
import { Organization, Plan, Subscription } from "@/lib/models";

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
 * Os estados em que a assinatura é a VIGENTE da organização -- os mesmos do
 * índice único parcial `subscriptions_current_unique_idx`.
 */
export const VIGENTES: SubscriptionStatus[] = ["trialing", "active", "past_due", "incomplete"];

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

  // O índice único parcial garante no máximo UMA assinatura vigente por
  // organização, então `findOne` não esconde linha nenhuma.
  //
  // `of: Subscription` é o `FOR UPDATE OF s` de antes: trava SÓ a linha da
  // assinatura. Sem ele o lock pegaria também a linha do plano no JOIN, e toda
  // igreja do mesmo plano entraria na mesma fila.
  const linha = await Subscription.findOne({
    attributes: ["status", "trialEndsAt", "currentPeriodEnd"],
    include: [{
      model: Plan,
      as: "plan",
      attributes: ["slug", "name", "maxMembers", "maxUsers"],
      required: true,
    }],
    where: { organizationId: organization, status: VIGENTES },
    lock: lock ? { level: Transaction.LOCK.UPDATE, of: Subscription } : undefined,
    transaction,
    raw: true,
    nest: true,
  }) as unknown as {
    status: SubscriptionStatus;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    plan: { slug: string; name: string; maxMembers: number | null; maxUsers: number | null };
  } | null;

  if (lock && !linha) {
    await Organization.findOne({
      attributes: ["id"],
      where: { id: organization },
      lock: Transaction.LOCK.UPDATE,
      transaction,
      raw: true,
    });
  }

  if (!linha) return null;
  return {
    status: linha.status,
    trialEndsAt: linha.trialEndsAt,
    currentPeriodEnd: linha.currentPeriodEnd,
    planSlug: linha.plan.slug,
    planName: linha.plan.name,
    maxMembers: linha.plan.maxMembers,
    maxUsers: linha.plan.maxUsers,
  };
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
