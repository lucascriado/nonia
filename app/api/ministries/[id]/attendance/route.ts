import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/records";
import { assertBelongsToOrganization, filterOwnedMemberIds } from "@/lib/tenant";
import { QueryTypes } from "sequelize";

export const runtime = "nodejs";

type AttendancePayload = {
  date: string;
  records: Array<{ memberId: string; present: boolean; notes?: string }>;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("attendance.read");
    const { id } = await params;
    await assertBelongsToOrganization("ministries", "id", id, organizationId(auth));

    const url = new URL(request.url);
    const history = url.searchParams.get("history") === "1";
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

    if (history) {
      const { rows } = await query(`
        SELECT
          s.id,
          s.meeting_date AS date,
          s.title,
          COUNT(ar.member_id)::int AS "recordCount",
          COUNT(ar.member_id) FILTER (WHERE ar.present)::int AS "presentCount",
          COUNT(ar.member_id) FILTER (WHERE NOT ar.present)::int AS "absentCount"
        FROM ministry_attendance_sessions s
        LEFT JOIN ministry_attendance_records ar
          ON ar.session_id = s.id AND ar.organization_id = s.organization_id
        WHERE s.ministry_id = $1 AND s.organization_id = $2
        GROUP BY s.id
        ORDER BY s.meeting_date DESC
        LIMIT 12
      `, [id, organizationId(auth)]);
      return Response.json({ records: rows });
    }

    const { rows: members } = await query(`
      SELECT
        p.id,
        p.full_name AS name,
        p.email,
        COALESCE(ar.present, false) AS present,
        ar.notes
      FROM members m
      JOIN people p ON p.id = m.person_id AND p.organization_id = m.organization_id
      LEFT JOIN ministry_attendance_sessions s
        ON s.ministry_id = m.ministry_id AND s.meeting_date = $2 AND s.organization_id = m.organization_id
      LEFT JOIN ministry_attendance_records ar
        ON ar.session_id = s.id AND ar.member_id = m.person_id AND ar.organization_id = m.organization_id
      WHERE m.ministry_id = $1 AND m.organization_id = $3
      ORDER BY p.full_name
    `, [id, date, organizationId(auth)]);

    return Response.json({ date, members });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("attendance.write");
    const { id } = await params;
    const payload = await request.json() as AttendancePayload;
    if (!payload.date) return Response.json({ error: "Data da chamada é obrigatória." }, { status: 400 });

    await db.transaction(async (transaction) => {
      await assertBelongsToOrganization("ministries", "id", id, organizationId(auth), transaction);

      const sessionRows = await db.query<{ id: string }>(`
        INSERT INTO ministry_attendance_sessions (ministry_id, organization_id, meeting_date)
        VALUES ($1, $2, $3)
        ON CONFLICT (ministry_id, meeting_date)
        DO UPDATE SET updated_at = now()
        RETURNING id
      `, { bind: [id, organizationId(auth), payload.date], transaction, type: QueryTypes.SELECT });
      const sessionId = sessionRows[0].id;

      const records = Array.isArray(payload.records) ? payload.records : [];
      // Só entram na chamada os membros da própria organização.
      const owned = new Set(
        await filterOwnedMemberIds(records.map((record) => record.memberId), organizationId(auth), transaction),
      );

      for (const record of records) {
        if (!owned.has(record.memberId)) continue;
        await db.query(`
          INSERT INTO ministry_attendance_records (session_id, member_id, organization_id, present, notes)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (session_id, member_id)
          DO UPDATE SET present = EXCLUDED.present, notes = EXCLUDED.notes, updated_at = now()
        `, {
          bind: [sessionId, record.memberId, organizationId(auth), record.present, record.notes?.trim() || null],
          transaction,
        });
      }

      const ministryRows = await db.query<{ name: string }>(
        `SELECT name FROM ministries WHERE id = $1 AND organization_id = $2`,
        { bind: [id, organizationId(auth)], transaction, type: QueryTypes.SELECT },
      );
      await addActivity(
        transaction,
        auth,
        "members",
        "registrou presença da escola bíblica em",
        ministryRows[0]?.name ?? "Ministério",
      );
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
