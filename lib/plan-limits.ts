// Plano efetivo e aplicação dos tetos.
//
// O plano de uma organização é DERIVADO, não é simplesmente a linha em
// `subscriptions`. A regra, em ordem:
//
//   1. assinatura paga vigente (`active` ou `past_due`) -> o plano dela;
//   2. senão, avaliação ainda dentro do prazo -> o plano da avaliação;
//   3. senão -> Semente, gratuito e sem prazo.
//
// Isso é calculado NA LEITURA, de propósito, e não por tarefa agendada: não há
// cron nem processo de fundo, e a máquina pode estar desligada na hora em que
// um prazo virar. Derivando na leitura, o rebaixamento acontece sozinho e é
// impossível uma organização ficar num estado que ninguém atualizou.
//
// A linha em `subscriptions` continua sendo o CONTRATO (o que foi assinado,
// quando vence, qual o id no gateway). O plano efetivo é o que vale AGORA.
// Uma avaliação vencida continua com status 'trialing' no banco; quem ignora
// isso é esta função, e é o único lugar que precisa saber.
//
// Regras dos tetos:
//   * NULL é ilimitado.
//   * A verificação é `uso >= teto` na CRIAÇÃO. Quem já está acima do teto não
//     perde nada e ninguém fica sem acesso -- a organização só não cresce mais.
//   * O papel não interfere. Teto é comercial, não é permissão.

import { QueryTypes, type Transaction } from "sequelize";
import { db } from "@/lib/db";
import { organizationId, type AuthContext } from "@/lib/auth";
import { HttpError } from "@/lib/http";

export type LimitedResource = "members" | "users";

/** Plano gratuito para o qual toda organização cai quando nada mais vale. */
export const FREE_PLAN_SLUG = "semente";

type PlanRow = { slug: string; name: string; maxMembers: number | null; maxUsers: number | null };

export type EffectivePlan = PlanRow & {
  /** De onde o plano veio: assinatura paga, avaliação em curso, ou o gratuito. */
  source: "subscription" | "trial" | "free";
  trialEndsAt: string | null;
  /** Dias inteiros que faltam para a avaliação acabar. Null fora da avaliação. */
  trialDaysLeft: number | null;
  /** Houve uma avaliação e ela terminou. Muda a mensagem de quem esbarra. */
  trialExpired: boolean;
};

const RESOURCE = {
  members: { coluna: "max_members", rotulo: "membros", verbo: "cadastrar mais membros" },
  users: { coluna: "max_users", rotulo: "usuários com acesso", verbo: "dar acesso a mais gente" },
} as const;

type SubscriptionRow = { status: string; trialEndsAt: Date | null } & PlanRow;

/**
 * O plano que vale AGORA para a organização. Fonte única da regra.
 *
 * `lock` trava a linha da assinatura (ou, na falta dela, a da organização)
 * para que duas criações simultâneas na mesma igreja entrem em fila em vez de
 * furarem o teto juntas. Use dentro da transação da escrita.
 */
export async function resolveEffectivePlan(
  organization: string,
  options: { lock?: boolean; transaction?: Transaction } = {},
): Promise<EffectivePlan | null> {
  const { lock = false, transaction } = options;

  const assinaturas = await db.query<SubscriptionRow>(
    `SELECT s.status, s.trial_ends_at AS "trialEndsAt",
            p.slug, p.name, p.max_members AS "maxMembers", p.max_users AS "maxUsers"
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.organization_id = $1
       AND s.status IN ('trialing', 'active', 'past_due', 'incomplete')
     ${lock ? "FOR UPDATE OF s" : ""}`,
    { bind: [organization], transaction, type: QueryTypes.SELECT },
  );
  const assinatura = assinaturas[0] ?? null;

  if (lock && !assinatura) {
    // Sem assinatura não há o que travar; a organização serve de âncora para
    // manter a serialização por igreja.
    await db.query(`SELECT 1 FROM organizations WHERE id = $1 FOR UPDATE`, {
      bind: [organization],
      transaction,
      type: QueryTypes.SELECT,
    });
  }

  const agora = Date.now();
  const fimDaAvaliacao = assinatura?.trialEndsAt ? new Date(assinatura.trialEndsAt) : null;
  const avaliacaoValida = Boolean(fimDaAvaliacao && fimDaAvaliacao.getTime() > agora);
  const avaliacaoVencida = Boolean(fimDaAvaliacao && fimDaAvaliacao.getTime() <= agora);

  const base = (plano: PlanRow, source: EffectivePlan["source"], comPrazo: boolean): EffectivePlan => ({
    ...plano,
    source,
    trialEndsAt: fimDaAvaliacao ? fimDaAvaliacao.toISOString() : null,
    trialDaysLeft:
      comPrazo && fimDaAvaliacao
        ? Math.max(0, Math.ceil((fimDaAvaliacao.getTime() - agora) / 86_400_000))
        : null,
    trialExpired: avaliacaoVencida,
  });

  // 1. Assinatura paga vigente vence tudo. 'incomplete' é cobrança ainda não
  //    confirmada, então NÃO libera o plano pago -- cai para os passos abaixo.
  if (assinatura && (assinatura.status === "active" || assinatura.status === "past_due")) {
    return base(assinatura, "subscription", false);
  }

  // 2. Avaliação dentro do prazo.
  if (assinatura && assinatura.status === "trialing" && avaliacaoValida) {
    return base(assinatura, "trial", true);
  }

  // 3. Gratuito, sem prazo para expirar.
  const gratuitos = await db.query<PlanRow>(
    `SELECT slug, name, max_members AS "maxMembers", max_users AS "maxUsers"
     FROM plans WHERE slug = $1 AND is_active`,
    { bind: [FREE_PLAN_SLUG], transaction, type: QueryTypes.SELECT },
  );
  if (!gratuitos[0]) return null;
  return base(gratuitos[0], "free", false);
}

export async function usoAtual(resource: LimitedResource, organization: string, transaction?: Transaction) {
  if (resource === "members") {
    const rows = await db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM members WHERE organization_id = $1`,
      { bind: [organization], transaction, type: QueryTypes.SELECT },
    );
    return rows[0].total;
  }

  // Um assento é ocupado por quem tem acesso e por quem foi convidado e ainda
  // não entrou. Sem contar o convite pendente, dava para furar o teto
  // enfileirando convites e deixando todos aceitarem depois.
  // Suspenso não ocupa assento: ele não entra no sistema. Reativar volta a
  // ocupar, e por isso a reativação também é verificada.
  const rows = await db.query<{ total: number }>(
    `SELECT (
       (SELECT count(*) FROM organization_members
         WHERE organization_id = $1 AND status <> 'suspended')
       +
       (SELECT count(*) FROM invitations
         WHERE organization_id = $1 AND status = 'pending' AND expires_at > now())
     )::int AS total`,
    { bind: [organization], transaction, type: QueryTypes.SELECT },
  );
  return rows[0].total;
}

/**
 * O plano mais barato que resolve o problema de quem esbarrou.
 *
 * `trial_days = 0` exclui o plano de avaliação: ninguém "faz upgrade" para um
 * período de teste. Sem esse filtro, quem estoura o Semente (100 membros)
 * seria mandado para a Avaliação (200), que é temporária e mais barata em
 * nada -- foi o que o teste pegou.
 */
async function planoQueResolve(
  resource: LimitedResource,
  atual: PlanRow,
  teto: number,
  transaction?: Transaction,
) {
  const coluna = RESOURCE[resource].coluna;
  const rows = await db.query<{ name: string }>(
    `SELECT name FROM plans
     WHERE is_active AND trial_days = 0 AND slug <> $1
       AND (${coluna} IS NULL OR ${coluna} > $2)
     ORDER BY sort_order
     LIMIT 1`,
    { bind: [atual.slug, teto], transaction, type: QueryTypes.SELECT },
  );
  return rows[0]?.name ?? null;
}

/**
 * Recusa a criação quando o teto do plano já foi alcançado.
 * Chame DENTRO da transação da escrita, passando a transação.
 */
export async function assertWithinPlanLimit(
  auth: AuthContext,
  resource: LimitedResource,
  transaction?: Transaction,
) {
  const organization = organizationId(auth);
  const plano = await resolveEffectivePlan(organization, { lock: true, transaction });
  if (!plano) return;

  const teto = resource === "members" ? plano.maxMembers : plano.maxUsers;
  if (teto === null) return;

  const uso = await usoAtual(resource, organization, transaction);
  if (uso < teto) return;

  const { rotulo, verbo } = RESOURCE[resource];
  const sugerido = await planoQueResolve(resource, plano, teto, transaction);
  const saida = sugerido
    ? `Para ${verbo}, assine o plano ${sugerido}.`
    : "Fale com a gente para ampliar o limite.";

  // A mensagem faz parte do produto: quem esbarra aqui é justamente quem a
  // gente quer que assine. Ela diz o que aconteceu, onde a igreja está e o que
  // fazer -- em vez de um "não autorizado" seco.
  //
  // Quem caiu da avaliação para o gratuito merece a frase mais explícita das
  // duas: é o momento em que a pessoa decide assinar ou abandonar, e descobrir
  // sozinha que "o plano mudou" seria péssimo.
  const mensagem =
    plano.source === "free" && plano.trialExpired
      ? `A sua avaliação terminou e a igreja voltou para o plano ${plano.name}, ` +
        `gratuito e sem prazo, com até ${teto} ${rotulo}. ` +
        `Você tem ${uso} — tudo continua disponível para consultar e editar. ${saida}`
      : `O plano ${plano.name} permite até ${teto} ${rotulo} e a sua igreja ` +
        `${uso > teto ? `já tem ${uso}` : "já chegou nesse número"}. ${saida}`;

  throw new HttpError(402, mensagem, "plan_limit_reached",
    {
      resource,
      limit: teto,
      current: uso,
      plan: { slug: plano.slug, name: plano.name, source: plano.source },
      trialExpired: plano.trialExpired,
      suggestedPlan: sugerido,
    },
  );
}

/** Plano efetivo + uso atual, para a tela avisar ANTES de a pessoa esbarrar. */
export async function planSnapshot(organization: string) {
  const plan = await resolveEffectivePlan(organization);
  if (!plan) return null;

  const [members, users] = await Promise.all([
    usoAtual("members", organization),
    usoAtual("users", organization),
  ]);

  return {
    slug: plan.slug,
    name: plan.name,
    source: plan.source,
    maxMembers: plan.maxMembers,
    maxUsers: plan.maxUsers,
    trialEndsAt: plan.trialEndsAt,
    trialDaysLeft: plan.trialDaysLeft,
    trialExpired: plan.trialExpired,
    usage: { members, users },
  };
}
