// Troca de papel, desativação e remoção de um usuário dentro da organização.
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { badRequest, forbidden, notFound, readJson, requireUuid } from "@/lib/http";
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
  const rows = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count
     FROM organization_members om
     JOIN roles r ON r.id = om.role_id
     WHERE om.organization_id = $1 AND om.status = 'active' AND r.slug = 'owner'`,
    { bind: [organization], type: QueryTypes.SELECT },
  );
  return rows[0]?.count ?? 0;
}

async function membership(organization: string, userId: string) {
  const rows = await db.query<{
    userId: string;
    roleSlug: string;
    roleLevel: number;
    fullName: string;
    status: string;
    organizationCount: number;
  }>(
    `SELECT om.user_id AS "userId", r.slug AS "roleSlug", r.level AS "roleLevel",
            u.full_name AS "fullName", om.status,
            (SELECT count(*)::int FROM organization_members o2 WHERE o2.user_id = om.user_id) AS "organizationCount"
     FROM organization_members om
     JOIN roles r ON r.id = om.role_id
     JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = $1 AND om.user_id = $2`,
    { bind: [organization, userId], type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
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
      if (target.userId === auth.user.id) {
        throw forbidden(
          "Use POST /api/auth/password para trocar a sua própria senha; ela pede a senha atual.",
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
      const roles = await db.query<{ id: string }>(
        `SELECT id FROM roles
         WHERE slug = $1 AND (organization_id IS NULL OR organization_id = $2)
         ORDER BY organization_id NULLS LAST LIMIT 1`,
        { bind: [payload.roleSlug, organizationId(auth)], type: QueryTypes.SELECT },
      );
      if (!roles.length) throw badRequest("Papel inválido.", "invalid_role");
      roleId = roles[0].id;
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

      await db.query(
        `UPDATE organization_members
         SET role_id = COALESCE($3, role_id),
             status = COALESCE($4, status),
             person_id = CASE WHEN $5::boolean THEN $6::uuid ELSE person_id END
         WHERE organization_id = $1 AND user_id = $2`,
        {
          bind: [
            organizationId(auth),
            id,
            roleId,
            payload.status ?? null,
            payload.personId !== undefined,
            payload.personId ?? null,
          ],
          transaction,
        },
      );

      if (passwordHash) {
        await db.query(
          `UPDATE users SET password_hash = $2, failed_login_attempts = 0, locked_until = NULL
           WHERE id = $1`,
          { bind: [id, passwordHash], transaction },
        );
        // Senha nova invalida tudo que estava aberto com a antiga.
        await db.query(
          `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
          { bind: [id], transaction },
        );
        await addActivity(transaction, auth, "system", "redefiniu a senha de", target.fullName);
      }

      // Acesso suspenso derruba as sessões abertas naquela organização.
      if (payload.status === "suspended") {
        await db.query(
          `UPDATE sessions SET revoked_at = now()
           WHERE user_id = $1 AND organization_id = $2 AND revoked_at IS NULL`,
          { bind: [id, organizationId(auth)], transaction },
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
      await db.query(`DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2`, {
        bind: [organizationId(auth), id],
        transaction,
      });
      await addActivity(transaction, auth, "system", "removeu o acesso de", target.fullName);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
