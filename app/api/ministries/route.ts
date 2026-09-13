import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { Member, Ministry, Person } from "@/lib/models";
import { apiError } from "@/lib/records";
import { assertBelongsToOrganization, filterOwnedMemberIds } from "@/lib/tenant";

export const runtime = "nodejs";

type MinistryPayload = {
  name: string;
  description?: string;
  color?: string;
  leaderId?: string;
  memberIds?: string[];
};

type PessoaDoMinisterio = { id: string; name: string; email: string | null };

export async function GET() {
  try {
    const auth = await requirePermission("ministries.read");
    const org = organizationId(auth);

    const ministerios = await Ministry.findAll({
      attributes: ["id", "name", "color", "description", "leaderId"],
      where: { organizationId: org },
      order: [["created_at", "DESC"], ["name", "ASC"]],
      raw: true,
    });

    // Líderes, vínculos e pessoas em consultas separadas, juntados aqui. Era um
    // GROUP BY com json_agg; o resultado é o mesmo, e o tenant vai em cada uma.
    const idsDosMinisterios = ministerios.map((m) => m.id);
    const idsDosLideres = [...new Set(ministerios.map((m) => m.leaderId).filter((id): id is string => Boolean(id)))];
    const [lideres, vinculos] = await Promise.all([
      idsDosLideres.length
        ? Person.findAll({ attributes: ["id", "fullName"], where: { organizationId: org, id: idsDosLideres }, raw: true })
        : Promise.resolve([] as { id: string; fullName: string }[]),
      idsDosMinisterios.length
        ? Member.findAll({
          attributes: ["personId", "ministryId"],
          where: { organizationId: org, ministryId: idsDosMinisterios },
          raw: true,
        })
        : Promise.resolve([] as { personId: string; ministryId: string | null }[]),
    ]);
    const nomeDoLider = new Map(lideres.map((l) => [l.id, l.fullName]));

    // A ordem dos membros é a do BANCO (`ORDER BY full_name`), não um sort em
    // JS: a collation do Postgres e a do JavaScript discordam em acento e caixa.
    const pessoas = vinculos.length
      ? await Person.findAll({
        attributes: ["id", ["full_name", "name"], "email"],
        where: { organizationId: org, id: vinculos.map((v) => v.personId) },
        order: [["fullName", "ASC"]],
        raw: true,
      }) as unknown as PessoaDoMinisterio[]
      : [];

    const contagem = new Map<string, number>();
    const ministerioDaPessoa = new Map<string, string>();
    for (const v of vinculos) {
      if (!v.ministryId) continue;
      contagem.set(v.ministryId, (contagem.get(v.ministryId) ?? 0) + 1);
      ministerioDaPessoa.set(v.personId, v.ministryId);
    }
    const membrosPorMinisterio = new Map<string, PessoaDoMinisterio[]>();
    for (const p of pessoas) {
      const ministryId = ministerioDaPessoa.get(p.id);
      if (!ministryId) continue;
      membrosPorMinisterio.set(ministryId, [...(membrosPorMinisterio.get(ministryId) ?? []), { id: p.id, name: p.name, email: p.email }]);
    }

    const rows = ministerios.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      description: m.description,
      leaderId: m.leaderId,
      leaderName: m.leaderId ? nomeDoLider.get(m.leaderId) ?? null : null,
      memberCount: contagem.get(m.id) ?? 0,
      members: membrosPorMinisterio.get(m.id) ?? [],
    }));

    // Voluntários são os membros (distintos por pessoa, que é a PK de
    // `members`) ligados a algum ministério desta igreja; ministérios ativos,
    // todos os da igreja.
    const summary = { totalVolunteers: vinculos.length, activeMinistries: ministerios.length };

    return Response.json({ ministries: rows, summary });
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

      const created = await Ministry.create({
        organizationId: organizationId(auth),
        name,
        color: payload.color || "purple",
        description: payload.description?.trim() || null,
        leaderId: payload.leaderId || null,
      }, { transaction });

      const ministryId = created.id;
      const memberIds = await filterOwnedMemberIds(payload.memberIds ?? [], organizationId(auth), transaction);
      for (const memberId of memberIds) {
        await Member.update(
          { ministryId },
          { where: { personId: memberId, organizationId: organizationId(auth) }, transaction },
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
