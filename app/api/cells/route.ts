import { col, fn } from "sequelize";
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { assignMembersToCell } from "@/lib/cell-membership";
import { Cell, CellMember, Person } from "@/lib/models";
import { apiError } from "@/lib/records";
import { assertBelongsToOrganization } from "@/lib/tenant";
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

type LinhaDaCelula = {
  id: string;
  name: string;
  address: string | null;
  meetingDay: string;
  meetingTime: string;
  color: string;
  notes: string | null;
  leaderId: string | null;
};

type PessoaDaCelula = { id: string; name: string; email: string | null };

export async function GET() {
  try {
    const auth = await requirePermission("cells.read");
    const org = organizationId(auth);

    const celulas = await Cell.findAll({
      attributes: [
        "id", "name", "address", "meetingDay",
        [fn("to_char", col("meeting_time"), "HH24:MI"), "meetingTime"],
        "color", "notes", "leaderId",
      ],
      where: { organizationId: org },
      order: [["created_at", "DESC"], ["name", "ASC"]],
      raw: true,
    }) as unknown as LinhaDaCelula[];

    if (celulas.length === 0) return Response.json([]);

    // Líderes, vínculos e pessoas em consultas separadas, juntados aqui. Era um
    // GROUP BY com json_agg; o resultado é o mesmo, e o tenant vai em cada uma.
    const idsDosLideres = [...new Set(celulas.map((c) => c.leaderId).filter((id): id is string => Boolean(id)))];
    const [lideres, vinculos] = await Promise.all([
      idsDosLideres.length
        ? Person.findAll({ attributes: ["id", "fullName"], where: { organizationId: org, id: idsDosLideres }, raw: true })
        : Promise.resolve([] as { id: string; fullName: string }[]),
      CellMember.findAll({
        attributes: ["cellId", "memberId"],
        where: { organizationId: org, cellId: celulas.map((c) => c.id) },
        raw: true,
      }),
    ]);
    const nomeDoLider = new Map(lideres.map((l) => [l.id, l.fullName]));

    // A ordem dos membros é a do BANCO (`ORDER BY full_name`), não um sort em
    // JS: a collation do Postgres e a do JavaScript discordam em acento e caixa.
    const pessoas = vinculos.length
      ? await Person.findAll({
        attributes: ["id", ["full_name", "name"], "email"],
        where: { organizationId: org, id: [...new Set(vinculos.map((v) => v.memberId))] },
        order: [["fullName", "ASC"]],
        raw: true,
      }) as unknown as PessoaDaCelula[]
      : [];

    const contagem = new Map<string, number>();
    const celulaDaPessoa = new Map<string, string[]>();
    for (const v of vinculos) {
      contagem.set(v.cellId, (contagem.get(v.cellId) ?? 0) + 1);
      celulaDaPessoa.set(v.memberId, [...(celulaDaPessoa.get(v.memberId) ?? []), v.cellId]);
    }
    const membrosPorCelula = new Map<string, PessoaDaCelula[]>();
    for (const p of pessoas) {
      for (const cellId of celulaDaPessoa.get(p.id) ?? []) {
        membrosPorCelula.set(cellId, [...(membrosPorCelula.get(cellId) ?? []), { id: p.id, name: p.name, email: p.email }]);
      }
    }

    const rows = celulas.map((c) => ({
      id: c.id,
      name: c.name,
      address: c.address,
      meetingDay: c.meetingDay,
      meetingTime: c.meetingTime,
      color: c.color,
      notes: c.notes,
      leaderId: c.leaderId,
      leaderName: c.leaderId ? nomeDoLider.get(c.leaderId) ?? null : null,
      memberCount: contagem.get(c.id) ?? 0,
      members: membrosPorCelula.get(c.id) ?? [],
    }));
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

      const created = await Cell.create({
        organizationId: organizationId(auth),
        name,
        leaderId: payload.leaderId || null,
        address: payload.address?.trim() || null,
        meetingDay: payload.meetingDay || "Domingo",
        meetingTime: payload.meetingTime || "19:30",
        color: payload.color || "purple",
        notes: payload.notes?.trim() || null,
      }, { transaction });

      const cellId = created.id;
      await assignMembersToCell(auth, cellId, name, payload.memberIds ?? [], transaction);
      await addActivity(transaction, auth, "members", "criou a célula", name);
      return cellId;
    });

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
