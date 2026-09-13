import { Op, cast, type Transaction, type WhereOptions } from "sequelize";
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { AuthContext, organizationId, requirePermission } from "@/lib/auth";
import { notFound, readJson, requireUuid } from "@/lib/http";
import { Event, EventResponsible, Person } from "@/lib/models";
import { apiError, nullable } from "@/lib/records";
import { filterOwnedPersonIds } from "@/lib/tenant";

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

/**
 * Um instante vindo da tela, interpretado PELO POSTGRES, como o SQL antigo
 * fazia com o texto cru.
 *
 * Não é o `DataTypes.DATE` do Sequelize de propósito: ele passa a string pelo
 * moment, que lê "2026-10-01T19:00" (sem fuso, que é o que o calendário manda)
 * no fuso da MÁQUINA do Node. O Postgres lê no fuso da sessão, que o Sequelize
 * fixa em +00:00. Em qualquer servidor fora de UTC os dois discordariam, e o
 * evento mudaria de hora sem ninguém ter mexido nele.
 */
const instante = (valor: string) => cast(valor, "timestamptz");

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("events.read");
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const org = organizationId(auth);

    // O tenant é sempre a primeira condição; os filtros vêm depois dele.
    const condicoes: WhereOptions[] = [{ organizationId: org }];
    if (from) condicoes.push({ startsAt: { [Op.gte]: instante(from) } });
    if (to) condicoes.push({ startsAt: { [Op.lt]: instante(to) } });

    const eventos = await Event.findAll({
      attributes: ["id", "title", "description", "location", "startsAt", "endsAt", "category", "color"],
      where: { [Op.and]: condicoes },
      order: [["startsAt", "ASC"]],
      raw: true,
    });

    // Os responsáveis vêm JUNTO, e não numa segunda chamada por evento: o
    // calendário desenha um mês inteiro de uma vez, e uma requisição por
    // evento seria a doença que a foto de perfil do WhatsApp evita. São id e
    // nome por pessoa -- alguns bytes, não a foto.
    //
    // Duas consultas para TODOS os eventos da resposta (vínculos, depois
    // pessoas) e a junção aqui. A ordem dos nomes é a do BANCO
    // (`ORDER BY full_name`), não um sort em JS: as collations discordam em
    // acento e caixa.
    const vinculos = eventos.length
      ? await EventResponsible.findAll({
        attributes: ["eventId", "personId"],
        where: { organizationId: org, eventId: eventos.map((e) => e.id) },
        raw: true,
      })
      : [];
    const pessoas = vinculos.length
      ? await Person.findAll({
        attributes: ["id", ["full_name", "name"]],
        where: { organizationId: org, id: [...new Set(vinculos.map((v) => v.personId))] },
        order: [["fullName", "ASC"]],
        raw: true,
      }) as unknown as { id: string; name: string }[]
      : [];

    const eventosDaPessoa = new Map<string, string[]>();
    for (const v of vinculos) {
      eventosDaPessoa.set(v.personId, [...(eventosDaPessoa.get(v.personId) ?? []), v.eventId]);
    }
    const responsaveis = new Map<string, { id: string; name: string }[]>();
    for (const p of pessoas) {
      for (const eventId of eventosDaPessoa.get(p.id) ?? []) {
        responsaveis.set(eventId, [...(responsaveis.get(eventId) ?? []), { id: p.id, name: p.name }]);
      }
    }

    const rows = eventos.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      category: e.category,
      color: e.color,
      responsibles: responsaveis.get(e.id) ?? [],
    }));

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
      const endsAt = nullable(payload.endsAt);
      const novo = await Event.create({
        organizationId: organizationId(auth),
        title,
        description: nullable(payload.description),
        location,
        // Ver `instante`: o texto vai para o Postgres interpretar. O tipo do
        // Model diz Date, mas o valor é um CAST, que o Sequelize repassa.
        startsAt: instante(startsAt) as unknown as Date,
        endsAt: endsAt === null ? null : instante(endsAt) as unknown as Date,
        color,
      }, { transaction });
      await gravarResponsaveis(auth, novo.id, payload.responsibleIds, transaction);
      await addActivity(transaction, auth, "calendar", "criou o evento", title, location);
      return novo.id;
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
      const event = await Event.findOne({
        attributes: ["title", "location"],
        where: { id, organizationId: organizationId(auth) },
        transaction,
        raw: true,
      });
      if (!event) throw notFound("Evento não encontrado.");

      await Event.destroy({ where: { id, organizationId: organizationId(auth) }, transaction });
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

  await EventResponsible.destroy({ where: { eventId, organizationId: organizationId(auth) }, transaction });

  // Sem repetidos: a PK do banco recusaria o segundo, e recusar um clique
  // duplo com erro seria pior que absorvê-lo.
  const unicos = [...new Set((ids ?? []).map(id => id.trim()).filter(Boolean))];
  if (unicos.length === 0) return;

  const proprios = await filterOwnedPersonIds(unicos, organizationId(auth), transaction);
  for (const personId of proprios) {
    await EventResponsible.bulkCreate(
      [{ eventId, personId, organizationId: organizationId(auth) }],
      { ignoreDuplicates: true, returning: false, transaction },
    );
  }
}
