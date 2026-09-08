import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { AuthContext, organizationId, requirePermission } from "@/lib/auth";
import { notFound, readJson, requireUuid } from "@/lib/http";
import { apiError, nullable } from "@/lib/records";
import { filterOwnedPersonIds } from "@/lib/tenant";
import { Transaction } from "sequelize";

export const runtime = "nodejs";

type EventPayload = {
  title?: string;
  description?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  color?: string;
  /**
   * Os responsáveis por realizar o evento, por id de PESSOA.
   *
   * Plural de verdade -- ao contrário do "a que ministérios a pessoa pertence",
   * que o schema torna singular. Ausente ou vazio é evento sem responsável
   * definido, que é estado legítimo e é como todo evento existente está.
   */
  responsibleIds?: string[];
};

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("events.read");
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // O tenant é sempre o primeiro parâmetro; os filtros vêm depois dele.
    // Com o alias `e` desde a origem: a consulta passou a ter um JOIN lateral
    // para os responsáveis, e coluna sem alias ficaria ambígua.
    const values: unknown[] = [organizationId(auth)];
    const filters: string[] = ["e.organization_id = $1"];

    if (from) {
      values.push(from);
      filters.push(`e.starts_at >= $${values.length}`);
    }

    if (to) {
      values.push(to);
      filters.push(`e.starts_at < $${values.length}`);
    }

    const { rows } = await query(`
      SELECT e.id, e.title, e.description, e.location, e.starts_at AS "startsAt",
        e.ends_at AS "endsAt", e.category, e.color,
        -- Os responsáveis vêm JUNTO, e não numa segunda chamada por evento: o
        -- calendário desenha um mês inteiro de uma vez, e uma requisição por
        -- evento seria a doença que a foto de perfil do WhatsApp evita. São
        -- id e nome por pessoa -- alguns bytes, não a foto.
        COALESCE((
          SELECT json_agg(json_build_object('id', p.id, 'name', p.full_name) ORDER BY p.full_name)
            FROM event_responsibles er
            JOIN people p ON p.id = er.person_id AND p.organization_id = er.organization_id
           WHERE er.event_id = e.id AND er.organization_id = e.organization_id
        ), '[]') AS responsibles
      FROM events e WHERE ${filters.join(" AND ")}
      ORDER BY e.starts_at ASC
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
      const novoId = (rows as Array<{ id: string }>)[0].id;
      await gravarResponsaveis(auth, novoId, payload.responsibleIds, transaction);
      await addActivity(transaction, auth, "calendar", "criou o evento", title, location);
      return novoId;
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

/**
 * Reescreve os responsáveis de um evento.
 *
 * `filterOwnedPersonIds` é o que impede um id de outra igreja de entrar. O
 * banco recusaria de qualquer jeito -- as duas FKs compostas passam pelo MESMO
 * organization_id da linha --, mas a recusa de lá seria um 23503 opaco no meio
 * de uma transação; aqui o id estranho é simplesmente ignorado, que é o mesmo
 * tratamento que `assignMembersToCell` já dá.
 *
 * Reescreve inteiro em vez de casar linha a linha: o conjunto é pequeno, e a
 * diferença nunca vale o risco de sobrar um vínculo órfão.
 */
async function gravarResponsaveis(
  auth: AuthContext,
  eventId: string,
  ids: string[] | undefined,
  transaction: Transaction,
) {
  if (ids === undefined) return;

  await db.query(
    `DELETE FROM event_responsibles WHERE event_id = $1 AND organization_id = $2`,
    { bind: [eventId, organizationId(auth)], transaction },
  );

  // Sem repetidos: a PK do banco recusaria o segundo, e recusar um clique
  // duplo com erro seria pior que absorvê-lo.
  const unicos = [...new Set((ids ?? []).map(id => id.trim()).filter(Boolean))];
  if (unicos.length === 0) return;

  const proprios = await filterOwnedPersonIds(unicos, organizationId(auth), transaction);
  for (const personId of proprios) {
    await db.query(
      `INSERT INTO event_responsibles (event_id, person_id, organization_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      { bind: [eventId, personId, organizationId(auth)], transaction },
    );
  }
}
