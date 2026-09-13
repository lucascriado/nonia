import type { Transaction } from "sequelize";
import { Organization, OrganizationMember, Plan, Role, Subscription } from "@/lib/models";

/** "Igreja Batista Central" -> "igreja-batista-central" */
export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Slug livre a partir do nome, com sufixo numérico em caso de colisão. */
export async function uniqueOrganizationSlug(desired: string, transaction?: Transaction) {
  const base = slugify(desired) || "igreja";

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existente = await Organization.findOne({
      attributes: ["id"],
      where: { slug: candidate },
      transaction,
      raw: true,
    });
    if (!existente) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (value: string) => value.trim().toLowerCase();


/**
 * Cria uma organização e põe o usuário como proprietário dela.
 *
 * Existe porque DOIS caminhos criam igreja: o cadastro (que também cria a
 * pessoa) e a criação de uma segunda igreja por quem já tem conta. Se cada um
 * montasse a sua, um dia um ganharia um campo que o outro não tem, e a
 * diferença só apareceria para quem entrou pelo outro caminho.
 *
 * `comAvaliacao` distingue os dois casos, e é a única diferença real:
 *   cadastro          -> nasce em avaliação de 14 dias
 *   segunda igreja    -> nasce no plano gratuito, SEM avaliação
 * A avaliação existe para a igreja EXPERIMENTAR o produto; quem já tem uma
 * igreja aqui já experimentou, e a segunda é expansão, não avaliação. Sem essa
 * distinção, criar igrejas viraria avaliação infinita de graça -- justamente
 * para o perfil que a gente quer vender o plano Rede.
 *
 * `isDefault` obedece ao índice único organization_members(user_id) WHERE
 * is_default: só um vínculo por pessoa pode ser o padrão, então o segundo em
 * diante nasce false. É guarda boa, e a rota nova obedece em vez de contornar.
 */
export async function criarOrganizacaoComDono(
  dados: { name: string; slug?: string; document?: string | null; email?: string | null; phone?: string | null },
  userId: string,
  opcoes: { comAvaliacao: boolean; isDefault: boolean },
  transaction: Transaction,
) {
  const slug = await uniqueOrganizationSlug(dados.slug || dados.name, transaction);

  const organization = await Organization.create(
    {
      name: dados.name,
      slug,
      document: dados.document ?? null,
      email: dados.email ?? null,
      phone: dados.phone ?? null,
    },
    { transaction },
  );

  const papelDono = await Role.findOne({
    attributes: ["id"],
    where: { organizationId: null, slug: "owner" },
    transaction,
    raw: true,
  });
  if (!papelDono) throw new Error("Papel 'owner' ausente: a migration 004 não foi aplicada.");

  await OrganizationMember.create(
    {
      organizationId: organization.id,
      userId,
      roleId: papelDono.id,
      status: "active",
      isDefault: opcoes.isDefault,
    },
    { transaction },
  );

  if (opcoes.comAvaliacao) {
    // Sem o plano 'avaliacao' no banco não se cria nada, e sem erro -- era o
    // comportamento do INSERT ... SELECT, que simplesmente não inseria linha.
    const avaliacao = await Plan.findOne({
      attributes: ["id", "trialDays"],
      where: { slug: "avaliacao" },
      transaction,
      raw: true,
    });
    if (avaliacao) {
      await Subscription.create(
        {
          organizationId: organization.id,
          planId: avaliacao.id,
          status: "trialing",
          // Dias corridos de 24h a partir de agora. O prazo do plano é dado do
          // banco (`trial_days`), não constante daqui.
          trialEndsAt: new Date(Date.now() + avaliacao.trialDays * 24 * 60 * 60 * 1000),
        },
        { transaction },
      );
    }
  }
  // Sem avaliação NÃO se cria linha de assinatura, de propósito: o plano
  // efetivo já resolve para o gratuito quando não há nenhuma, e inventar uma
  // assinatura "active" num plano de preço zero diria que alguém pagou.

  return organization;
}
