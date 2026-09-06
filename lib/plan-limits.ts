// Aplicação dos tetos do plano.
//
// O teto vem SEMPRE do plano da assinatura vigente da organização, lido do
// banco. Nada de constante no código: quando o preço ou o limite mudar, muda
// uma linha em `plans` e o comportamento acompanha.
//
// Regras que valem para os dois tetos:
//   * NULL é ilimitado.
//   * A verificação é `uso >= teto` na CRIAÇÃO. Uma organização que já está
//     acima do teto (o plano mudou, ou os dados vieram antes da regra) não
//     perde nada e ninguém fica sem acesso -- ela só não cresce mais.
//   * O papel não interfere. Teto é comercial, não é permissão: owner esbarra
//     igual a todo mundo.
//   * Sem assinatura vigente, não há teto. É anomalia de dado, e bloquear toda
//     criação por causa dela seria um falso positivo caro.

import { QueryTypes, type Transaction } from "sequelize";
import { db } from "@/lib/db";
import { organizationId, type AuthContext } from "@/lib/auth";
import { HttpError } from "@/lib/http";

export type LimitedResource = "members" | "users";

type PlanRow = { slug: string; name: string; maxMembers: number | null; maxUsers: number | null };

const RESOURCE = {
  members: { coluna: "max_members", rotulo: "membros", verbo: "cadastrar mais membros" },
  users: { coluna: "max_users", rotulo: "usuários com acesso", verbo: "dar acesso a mais gente" },
} as const;

async function planoVigente(organization: string, transaction?: Transaction) {
  // FOR UPDATE OF s trava a linha da assinatura, então duas criações
  // simultâneas na mesma organização entram em fila em vez de furarem o teto
  // juntas. Só a assinatura é travada; o resto da consulta não bloqueia nada.
  const rows = await db.query<PlanRow>(
    `SELECT p.slug, p.name, p.max_members AS "maxMembers", p.max_users AS "maxUsers"
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.organization_id = $1
       AND s.status IN ('trialing', 'active', 'past_due', 'incomplete')
     FOR UPDATE OF s`,
    { bind: [organization], transaction, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

async function usoAtual(resource: LimitedResource, organization: string, transaction?: Transaction) {
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
  const plano = await planoVigente(organization, transaction);
  if (!plano) return;

  const teto = resource === "members" ? plano.maxMembers : plano.maxUsers;
  if (teto === null) return;

  const uso = await usoAtual(resource, organization, transaction);
  if (uso < teto) return;

  const { rotulo, verbo } = RESOURCE[resource];
  const sugerido = await planoQueResolve(resource, plano, teto, transaction);
  const tem = uso > teto ? `já tem ${uso}` : "já chegou nesse número";

  // A mensagem faz parte do produto: quem esbarra aqui é justamente quem a
  // gente quer que assine, então ela diz o teto, onde a igreja está e o que
  // fazer -- em vez de um "não autorizado" seco.
  const saida = sugerido
    ? `Para ${verbo}, mude para o plano ${sugerido}.`
    : `Fale com a gente para ampliar o limite.`;

  throw new HttpError(
    402,
    `O plano ${plano.name} permite até ${teto} ${rotulo} e a sua igreja ${tem}. ${saida}`,
    "plan_limit_reached",
    {
      resource,
      limit: teto,
      current: uso,
      plan: { slug: plano.slug, name: plano.name },
      suggestedPlan: sugerido,
    },
  );
}
