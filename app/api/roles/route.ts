// Papéis que podem ser atribuídos dentro da organização (para o seletor de convite).
import { Op } from "sequelize";
import { organizationId, requirePermission } from "@/lib/auth";
import { Role, RolePermission } from "@/lib/models";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requirePermission("users.read", "users.write");

    // Papéis do sistema (organization_id nulo) e os próprios desta igreja.
    const papeis = await Role.findAll({
      attributes: ["id", "slug", "name", "description", "level"],
      where: { [Op.or]: [{ organizationId: null }, { organizationId: organizationId(auth) }] },
      order: [["level", "DESC"]],
      raw: true,
    });

    // As permissões de cada papel numa segunda consulta, montadas em JS. Papel
    // sem nenhuma permissão sai com lista vazia, e não fica de fora.
    const vinculos = papeis.length
      ? await RolePermission.findAll({
        attributes: ["roleId", "permissionSlug"],
        where: { roleId: papeis.map((papel) => papel.id) },
        raw: true,
      })
      : [];
    const permissoesPorPapel = new Map<string, string[]>();
    for (const { roleId, permissionSlug } of vinculos) {
      const lista = permissoesPorPapel.get(roleId) ?? [];
      lista.push(permissionSlug);
      permissoesPorPapel.set(roleId, lista);
    }

    const rows = papeis.map((papel) => ({
      id: papel.id,
      slug: papel.slug,
      name: papel.name,
      description: papel.description,
      level: papel.level,
      permissions: permissoesPorPapel.get(papel.id) ?? [],
    }));

    return Response.json(rows);
  } catch (error) {
    return apiError(error);
  }
}
