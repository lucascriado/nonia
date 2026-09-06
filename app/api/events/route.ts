import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { notFound, readJson, requireUuid } from "@/lib/http";
import { apiError, nullable } from "@/lib/records";

export const runtime = "nodejs";

type EventPayload = {
  title?: string;
  description?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  color?: string;
};

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("events.read");
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // O tenant é sempre o primeiro parâmetro; os filtros vêm depois dele.
    const values: unknown[] = [organizationId(auth)];
    const filters: string[] = ["organization_id = $1"];

    if (from) {
      values.push(from);
      filters.push(`starts_at >= $${values.length}`);
    }

    if (to) {
      values.push(to);
      filters.push(`starts_at < $${values.length}`);
    }

    const { rows } = await query(`
      SELECT id, title, description, location, starts_at AS "startsAt",
        ends_at AS "endsAt", category, color
      FROM events WHERE ${filters.join(" AND ")}
      ORDER BY starts_at ASC
    `, values);

    return Response.json(rows);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("events.write");
    const payload = await readJson<EventPayload>(request);
    const title = payload.title?.trim();
    const location = payload.location?.trim();
    const startsAt = payload.startsAt?.trim();
    const color = normalizeColor(payload.color);

    if (!title) return Response.json({ error: "Título é obrigatório." }, { status: 400 });
    if (!location) return Response.json({ error: "Local é obrigatório." }, { status: 400 });
    if (!startsAt) return Response.json({ error: "Data e horário são obrigatórios." }, { status: 400 });

    const id = await db.transaction(async (transaction) => {
      const [rows] = await db.query(`
        INSERT INTO events (organization_id, title, description, location, starts_at, ends_at, color)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, {
        bind: [
          organizationId(auth),
          title,
          nullable(payload.description),
          location,
          startsAt,
          nullable(payload.endsAt),
          color,
        ],
        transaction,
      });
      await addActivity(transaction, auth, "calendar", "criou o evento", title, location);
      return (rows as Array<{ id: string }>)[0].id;
    });

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requirePermission("events.write");
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "Evento não informado." }, { status: 400 });
    requireUuid(id, "Evento não encontrado.");

    await db.transaction(async (transaction) => {
      const [rows] = await db.query(
        `SELECT title, location FROM events WHERE id = $1 AND organization_id = $2`,
        { bind: [id, organizationId(auth)], transaction },
      );
      const event = (rows as Array<{ title: string; location: string }>)[0];
      if (!event) throw notFound("Evento não encontrado.");

      await db.query(`DELETE FROM events WHERE id = $1 AND organization_id = $2`, {
        bind: [id, organizationId(auth)],
        transaction,
      });
      await addActivity(transaction, auth, "calendar", "excluiu o evento", event.title, event.location);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

function normalizeColor(color?: string) {
  if (color === "green" || color === "blue" || color === "purple") return color;
  return "purple";
}
