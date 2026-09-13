// Troca de papel, desativação e remoção de um usuário dentro da organização.
import { Op } from "sequelize";
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { badRequest, forbidden, notFound, readJson, requireUuid } from "@/lib/http";
import { OrganizationMember, Role, Session, User } from "@/lib/models";
import { hashPassword, validatePasswordStrength } from "@/lib/passwords";
import { apiError } from "@/lib/records";
import { assertBelongsToOrganization } from "@/lib/tenant";
import { assertWithinPlanLimit } from "@/lib/plan-limits";

export const runtime = "nodejs";

type UpdatePayload = {
  roleSlug?: string;
  status?: string;
  personId?: string | null;
  /** Redefinição de senha pelo responsável. Ver as guardas em PATCH. */
  password?: string;
};

async function ownerCount(organization: string) {
  return OrganizationMember.count({
    where: { organizationId: organization, status: "active" },
    include: [{ model: Role, as: "role", attributes: [], where: { slug: "owner" }, required: true }],
  });
}

async function membership(organization: string, userId: string) {
  const [vinculo, organizationCount] = await Promise.all([
    OrganizationMember.findOne({
      attributes: ["userId", "status"],
      where: { organizationId: organization, userId },
      include: [
        { model: Role, as: "role", attributes: ["slug", "level"], required: true },
        { model: User, as: "user", attributes: ["fullName"], required: true },
      ],
      raw: true,
      nest: true,
    }) as unknown as Promise<{
      userId: string;
      status: string;
      role: { slug: string; level: number };
      user: { fullName: string };
    } | null>,
    // Em quantas igrejas a pessoa entra -- TODOS os vínculos dela, de
    // propósito sem filtro de organização: é o que decide se a senha, que é da
    // identidade, pode ser redefinida por um responsável DESTA igreja.
    OrganizationMember.count({ where: { userId } }),
  ]);
  if (!vinculo) return null;
  return {
    userId: vinculo.userId,
    roleSlug: vinculo.role.slug,
    roleLevel: vinculo.role.level,
    fullName: vinculo.user.fullName,
    status: vinculo.status,
    organizationCount,
  };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("users.write");
    const { id } = await context.params;
    requireUuid(id, "Usuário não encontrado nesta organização.");
    const payload = await readJson<UpdatePayload>(request);

    const target = await membership(organizationId(auth), id);
    if (!target) throw notFound("Usuário não encontrado nesta organização.");

    // Redefinição de senha: é o único caminho de recuperação do MVP, já que
    // a recuperação por e-mail ficou fora. As guardas abaixo existem porque
    // a identidade do usuário é global (um e-mail, várias igrejas).
    let passwordHash: string | null = null;
    if (payload.password !== undefined) {
      const passwordError = validatePasswordStrength(payload.password);
      if (passwordError) throw badRequest(passwordError, "weak_password");

      // Trocar a PRÓPRIA senha é POST /api/auth/password, que exige a senha
      // atual. Este caminho aqui é socorro e não exige nada, então não pode
      // valer para si mesmo -- não unifique os dois.
      //
      // A mensagem fala da AÇÃO, não da rota: quem lê isto é a secretaria da
      // igreja, para quem "POST /api/auth/password" não significa nada. E
      // nomeia a ação em vez da tela, para não quebrar se a tela mudar de
      // lugar.
      if (target.userId === auth.user.id) {
        throw forbidden(
          "Para trocar a sua própria senha, use a opção de alterar senha nas " +
            "configurações da sua conta. Ela pede a senha atual por segurança.",
          "self_password_reset",
        );
      }
      // Um admin redefinindo a senha do proprietário assumiria a conta dele,
      // inclusive a cobrança. Só se pode redefinir a senha de quem está
      // abaixo -- e o proprietário pode redefinir a de qualquer um.
      if (auth.role.slug !== "owner" && auth.role.level <= target.roleLevel) {
        throw forbidden(
          "Você só pode redefinir a senha de usuários com papel inferior ao seu.",
          "insufficient_role_level",
        );
      }
      // A senha é da identidade, não do vínculo: redefini-la aqui daria
      // acesso às outras igrejas em que essa pessoa entra com o mesmo e-mail.
      if (target.organizationCount > 1) {
        throw forbidden(
          "Este usuário também acessa outra organização, então a senha dele não pode ser redefinida por aqui.",
          "user_in_multiple_organizations",
        );
      }
      passwordHash = await hashPassword(payload.password);
    }

    if (target.userId === auth.user.id && (payload.roleSlug || payload.status)) {
      throw forbidden("Você não pode alterar o próprio papel ou acesso.", "self_update");
    }
    if (payload.roleSlug === "owner" && auth.role.slug !== "owner") {
      throw forbidden("Apenas o proprietário pode conceder o papel de proprietário.", "missing_role");
    }
    // Mexer num proprietário NÃO é proibido: com dois donos, rebaixar ou
    // suspender um deles é legítimo e passa. O que se impede é a organização
    // ficar SEM NENHUM proprietário ativo.
    //
    // A condição está escrita numa linha só porque a versão aninhada se lia
    // pela metade: o trecho falava de "owner" e parecia proibir mexer em
    // qualquer proprietário, quando a proibição depende da contagem.
    const perderiaOUltimoDono =
      target.roleSlug === "owner" &&
      (Boolean(payload.roleSlug) || payload.status === "suspended") &&
      (await ownerCount(organizationId(auth))) <= 1;

    if (perderiaOUltimoDono) {
      throw forbidden("A organização precisa de pelo menos um proprietário ativo.", "last_owner");
    }

    let roleId: string | null = null;
    if (payload.roleSlug) {
      // Como no POST: o papel próprio da igreja antes do papel do sistema.
      //
      // Só TEXTO chega ao `where`. No Sequelize um array vira `IN (...)`, e
      // `roleSlug: ["owner"]` passaria pela guarda de cima (que compara com
      // `=== "owner"`) e acharia o papel de proprietário. Com SQL cru o array
      // virava o texto '{"owner"}', não casava com papel nenhum e dava 400 --
      // que é o que continua dando.
      const role = typeof payload.roleSlug !== "string" ? null : await Role.findOne({
        attributes: ["id"],
        where: {
          slug: payload.roleSlug,
          [Op.or]: [{ organizationId: null }, { organizationId: organizationId(auth) }],
        },
        order: [["organizationId", "ASC NULLS LAST"]],
        raw: true,
      });
      if (!role) throw badRequest("Papel inválido.", "invalid_role");
      roleId = role.id;
    }

    if (payload.status && !["active", "suspended"].includes(payload.status)) {
      throw badRequest("Status inválido.", "invalid_status");
    }

    await db.transaction(async (transaction) => {
      // Reativar um suspenso volta a ocupar assento, então passa pelo teto
      // como se fosse um usuário novo. Suspender nunca é bloqueado.
      if (payload.status === "active" && target.status === "suspended") {
        await assertWithinPlanLimit(auth, "users", transaction);
      }

      // Mesmo motivo do POST: o uuid vem do payload e precisa ser desta igreja.
      if (payload.personId) {
        await assertBelongsToOrganization("people", "id", payload.personId, organizationId(auth), transaction);
      }

      // Só entra no UPDATE o que veio: papel e status ausentes mantêm o valor
      // atual, e `personId: null` explícito desvincula a ficha de pessoa.
      const valores: { roleId?: string; status?: string; personId?: string | null } = {};
      if (roleId != null) valores.roleId = roleId;
      if (payload.status != null) valores.status = payload.status;
      if (payload.personId !== undefined) valores.personId = payload.personId ?? null;

      await OrganizationMember.update(valores, {
        where: { organizationId: organizationId(auth), userId: id },
        transaction,
      });

      if (passwordHash) {
        await User.update(
          { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
          { where: { id }, transaction },
        );
        // Senha nova invalida tudo que estava aberto com a antiga.
        await Session.update(
          { revokedAt: new Date() },
          { where: { userId: id, revokedAt: null }, transaction },
        );
        await addActivity(transaction, auth, "system", "redefiniu a senha de", target.fullName);
      }

      // Acesso suspenso derruba as sessões abertas naquela organização.
      if (payload.status === "suspended") {
        await Session.update(
          { revokedAt: new Date() },
          { where: { userId: id, organizationId: organizationId(auth), revokedAt: null }, transaction },
        );
      }

      if (payload.roleSlug || payload.status || payload.personId !== undefined) {
        await addActivity(transaction, auth, "system", "atualizou o acesso de", target.fullName);
      }
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("users.write");
    const { id } = await context.params;
    requireUuid(id, "Usuário não encontrado nesta organização.");

    const target = await membership(organizationId(auth), id);
    if (!target) throw notFound("Usuário não encontrado nesta organização.");
    if (target.userId === auth.user.id) {
      throw forbidden("Você não pode remover o próprio acesso.", "self_delete");
    }
    // Como no PATCH: remover um proprietário é permitido, desde que sobre um.
    const perderiaOUltimoDono =
      target.roleSlug === "owner" && (await ownerCount(organizationId(auth))) <= 1;

    if (perderiaOUltimoDono) {
      throw forbidden("A organização precisa de pelo menos um proprietário ativo.", "last_owner");
    }

    await db.transaction(async (transaction) => {
      // Remove só o vínculo: o usuário segue existindo em outras igrejas.
      await OrganizationMember.destroy({
        where: { organizationId: organizationId(auth), userId: id },
        transaction,
      });
      await addActivity(transaction, auth, "system", "removeu o acesso de", target.fullName);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
