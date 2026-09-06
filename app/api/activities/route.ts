import { query } from "@/lib/db";
import { organizationId, requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("activities.read");
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const date = searchParams.get("date");
    const search = searchParams.get("search")?.trim();
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(10, Math.max(1, Number(searchParams.get("limit")) || 10));

    const values: unknown[] = [organizationId(auth)];
    const filters: string[] = ["organization_id = $1"];

    if (category && category !== "all") { values.push(category); filters.push(`category = $${values.length}`); }
    if (date && date !== "all") {
      const interval = date === "today" ? "1 day" : date === "week" ? "7 days" : "30 days";
      filters.push(`occurred_at >= now() - interval '${interval}'`);
    }
    if (search) { values.push(`%${search}%`); filters.push(`concat_ws(' ', actor, action, subject, details) ILIKE $${values.length}`); }

    const where = `WHERE ${filters.join(" AND ")}`;
    const count = await query<{ count: number }>(`SELECT count(*)::int AS count FROM activities ${where}`, values);
    values.push(limit, (page - 1) * limit);
    const records = await query(`
      SELECT id, category, actor, action, subject, details, occurred_at AS "occurredAt"
      FROM activities ${where} ORDER BY occurred_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values);
    return Response.json({ records: records.rows, total: count.rows[0].count, page, pageSize: limit });
  } catch (error) {
    return apiError(error);
  }
}
