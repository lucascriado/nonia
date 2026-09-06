// Papéis que podem ser atribuídos dentro da organização (para o seletor de convite).
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import { organizationId, requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requirePermission("users.read", "users.write");

    const rows = await db.query(
      `SELECT r.id, r.slug, r.name, r.description, r.level,
              COALESCE(array_agg(rp.permission_slug) FILTER (WHERE rp.permission_slug IS NOT NULL), ARRAY[]::varchar[]) AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       WHERE r.organization_id IS NULL OR r.organization_id = $1
       GROUP BY r.id
       ORDER BY r.level DESC`,
      { bind: [organizationId(auth)], type: QueryTypes.SELECT },
    );

    return Response.json(rows);
  } catch (error) {
    return apiError(error);
  }
}
