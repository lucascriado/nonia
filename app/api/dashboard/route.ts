import { apiError } from "@/lib/records";
import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [stats, activities, birthdays, events] = await Promise.all([
      query<{ totalMembers: number; visitorsThisMonth: number; activeCells: number; birthdaysThisMonth: number }>(`
        SELECT
          (SELECT count(*)::int FROM members WHERE status='active') AS "totalMembers",
          (SELECT count(*)::int FROM visitors WHERE date_trunc('month', visit_date)=date_trunc('month', CURRENT_DATE)) AS "visitorsThisMonth",
          (SELECT count(DISTINCT cell_name)::int FROM members WHERE status='active' AND cell_name <> 'Sem célula') AS "activeCells",
          (SELECT count(*)::int FROM people WHERE birth_date IS NOT NULL AND EXTRACT(MONTH FROM birth_date)=EXTRACT(MONTH FROM CURRENT_DATE)) AS "birthdaysThisMonth"
      `),
      query<{ id: string; category: string; actor: string; action: string; subject: string; occurredAt: string }>(`
        SELECT id, category, actor, action, subject, occurred_at AS "occurredAt"
        FROM (
          SELECT DISTINCT ON (category, actor, action, subject)
            id, category, actor, action, subject, occurred_at
          FROM activities
          ORDER BY category, actor, action, subject, occurred_at DESC
        ) recent_unique
        ORDER BY occurred_at DESC
        LIMIT 5
      `),
      query<{ id: string; name: string; birthDate: string }>(`
        SELECT id, full_name AS name, birth_date AS "birthDate"
        FROM people
        WHERE birth_date IS NOT NULL AND EXTRACT(MONTH FROM birth_date)=EXTRACT(MONTH FROM CURRENT_DATE)
        ORDER BY EXTRACT(DAY FROM birth_date) LIMIT 4
      `),
      query<{ id: string; title: string; location: string; startsAt: string; color: string }>(`
        SELECT id, title, location, starts_at AS "startsAt", color
        FROM events WHERE starts_at >= CURRENT_DATE ORDER BY starts_at LIMIT 6
      `),
    ]);
    return Response.json({ stats: stats.rows[0], activities: activities.rows, birthdays: birthdays.rows, events: events.rows });
  } catch (error) {
    return apiError(error);
  }
}
