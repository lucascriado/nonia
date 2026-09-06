import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { apiError } from "@/lib/records";
import { assertBelongsToOrganization, filterOwnedMemberIds } from "@/lib/tenant";
import { QueryTypes } from "sequelize";

export const runtime = "nodejs";

type MinistryPayload = {
  name: string;
  description?: string;
  color?: string;
  leaderId?: string;
  memberIds?: string[];
};

export async function GET() {
  try {
    const auth = await requirePermission("ministries.read");
    const { rows } = await query(`
      SELECT
        mi.id,
        mi.name,
        mi.color,
        mi.description,
        mi.leader_id AS "leaderId",
        leader.full_name AS "leaderName",
        COUNT(m.person_id)::int AS "memberCount",
        COALESCE(json_agg(json_build_object('id', p.id, 'name', p.full_name, 'email', p.email) ORDER BY p.full_name) FILTER (WHERE p.id IS NOT NULL), '[]') AS members
      FROM ministries mi
      LEFT JOIN people leader ON leader.id = mi.leader_id AND leader.organization_id = mi.organization_id
      LEFT JOIN members m ON m.ministry_id = mi.id AND m.organization_id = mi.organization_id
      LEFT JOIN people p ON p.id = m.person_id AND p.organization_id = mi.organization_id
      WHERE mi.organization_id = $1
      GROUP BY mi.id, leader.full_name
      ORDER BY mi.created_at DESC, mi.name
    `, [organizationId(auth)]);

    const { rows: summary } = await query<{ totalVolunteers: number; activeMinistries: number }>(`
      SELECT
        COUNT(DISTINCT m.person_id)::int AS "totalVolunteers",
        COUNT(DISTINCT mi.id)::int AS "activeMinistries"
      FROM ministries mi
      LEFT JOIN members m ON m.ministry_id = mi.id AND m.organization_id = mi.organization_id
      WHERE mi.organization_id = $1
    `, [organizationId(auth)]);

    return Response.json({ ministries: rows, summary: summary[0] ?? { totalVolunteers: 0, activeMinistries: 0 } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("ministries.write");
    const payload = await readJson<MinistryPayload>(request);
    const name = payload.name?.trim();
    if (!name) return Response.json({ error: "Nome do ministério é obrigatório." }, { status: 400 });

    const id = await db.transaction(async (transaction) => {
      if (payload.leaderId) {
        await assertBelongsToOrganization("people", "id", payload.leaderId, organizationId(auth), transaction);
      }

      const created = await db.query<{ id: string }>(`
        INSERT INTO ministries (organization_id, name, color, description, leader_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, {
        bind: [
          organizationId(auth),
          name,
          payload.color || "purple",
          payload.description?.trim() || null,
          payload.leaderId || null,
        ],
        transaction,
        type: QueryTypes.SELECT,
      });

      const ministryId = created[0].id;
      const memberIds = await filterOwnedMemberIds(payload.memberIds ?? [], organizationId(auth), transaction);
      for (const memberId of memberIds) {
        await db.query(
          `UPDATE members SET ministry_id = $1 WHERE person_id = $2 AND organization_id = $3`,
          { bind: [ministryId, memberId, organizationId(auth)], transaction },
        );
      }

      await addActivity(transaction, auth, "members", "criou o ministério", name);
      return ministryId;
    });

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
