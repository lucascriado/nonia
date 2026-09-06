import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { assignMembersToCell } from "@/lib/cell-membership";
import { apiError } from "@/lib/records";
import { assertBelongsToOrganization } from "@/lib/tenant";
import { QueryTypes } from "sequelize";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";

type CellPayload = {
  name: string;
  leaderId?: string;
  address?: string;
  meetingDay?: string;
  meetingTime?: string;
  color?: string;
  notes?: string;
  memberIds?: string[];
};

export async function GET() {
  try {
    const auth = await requirePermission("cells.read");
    const { rows } = await query(`
      SELECT
        c.id,
        c.name,
        c.address,
        c.meeting_day AS "meetingDay",
        to_char(c.meeting_time, 'HH24:MI') AS "meetingTime",
        c.color,
        c.notes,
        c.leader_id AS "leaderId",
        leader.full_name AS "leaderName",
        COUNT(cm.member_id)::int AS "memberCount",
        COALESCE(json_agg(json_build_object('id', p.id, 'name', p.full_name, 'email', p.email) ORDER BY p.full_name) FILTER (WHERE p.id IS NOT NULL), '[]') AS members
      FROM cells c
      LEFT JOIN people leader ON leader.id = c.leader_id AND leader.organization_id = c.organization_id
      LEFT JOIN cell_members cm ON cm.cell_id = c.id AND cm.organization_id = c.organization_id
      LEFT JOIN people p ON p.id = cm.member_id AND p.organization_id = c.organization_id
      WHERE c.organization_id = $1
      GROUP BY c.id, leader.full_name
      ORDER BY c.created_at DESC, c.name
    `, [organizationId(auth)]);
    return Response.json(rows);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("cells.write");
    const payload = await readJson<CellPayload>(request);
    const name = payload.name?.trim();
    if (!name) return Response.json({ error: "Nome da célula é obrigatório." }, { status: 400 });

    const id = await db.transaction(async (transaction) => {
      if (payload.leaderId) {
        await assertBelongsToOrganization("people", "id", payload.leaderId, organizationId(auth), transaction);
      }

      const created = await db.query<{ id: string }>(`
        INSERT INTO cells (organization_id, name, leader_id, address, meeting_day, meeting_time, color, notes)
        VALUES ($1, $2, $3, $4, $5, $6::time, $7, $8)
        RETURNING id
      `, {
        bind: [
          organizationId(auth),
          name,
          payload.leaderId || null,
          payload.address?.trim() || null,
          payload.meetingDay || "Domingo",
          payload.meetingTime || "19:30",
          payload.color || "purple",
          payload.notes?.trim() || null,
        ],
        transaction,
        type: QueryTypes.SELECT,
      });

      const cellId = created[0].id;
      await assignMembersToCell(auth, cellId, name, payload.memberIds ?? [], transaction);
      await addActivity(transaction, auth, "members", "criou a célula", name);
      return cellId;
    });

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
