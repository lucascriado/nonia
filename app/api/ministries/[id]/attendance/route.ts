import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { readJson, requireUuid } from "@/lib/http";
import { Member, MinistryAttendanceRecord, MinistryAttendanceSession, Ministry, Person } from "@/lib/models";
import { apiError } from "@/lib/records";
import { assertOwnedResource, filterOwnedMemberIds } from "@/lib/tenant";
import { hojeNoFuso } from "@/lib/datas";

export const runtime = "nodejs";

type AttendancePayload = {
  date: string;
  records: Array<{ memberId: string; present: boolean; notes?: string }>;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("attendance.read");
    const { id } = await params;
    requireUuid(id, "Ministério não encontrado.");
    await assertOwnedResource("ministries", id, organizationId(auth), "Ministério não encontrado.");
    const org = organizationId(auth);

    const url = new URL(request.url);
    const history = url.searchParams.get("history") === "1";
    // O padrão é hoje NA IGREJA. Era `toISOString()`, ou seja UTC: das 21h à
    // meia-noite em Brasília a rota abria a chamada de AMANHÃ -- uma lista
    // vazia num dia em que a reunião acabou de acontecer. Não grava nada, e é
    // justamente por isso que passa despercebido: quem olha conclui que a
    // chamada não foi feita, e refaz.
    const date = url.searchParams.get("date") || hojeNoFuso(auth.organization.timezone);

    if (history) {
      const sessoes = await MinistryAttendanceSession.findAll({
        attributes: ["id", ["meeting_date", "date"], "title"],
        where: { ministryId: id, organizationId: org },
        order: [["meetingDate", "DESC"]],
        limit: 12,
        raw: true,
      }) as unknown as { id: string; date: string; title: string }[];

      // As contagens saem das linhas de presença, somadas aqui. Era um
      // COUNT ... FILTER por sessão; `present` é NOT NULL, então ausente é
      // exatamente quem não está presente.
      const presencas = sessoes.length
        ? await MinistryAttendanceRecord.findAll({
          attributes: ["sessionId", "present"],
          where: { organizationId: org, sessionId: sessoes.map((s) => s.id) },
          raw: true,
        })
        : [];

      const rows = sessoes.map((s) => {
        const daSessao = presencas.filter((p) => p.sessionId === s.id);
        const presentCount = daSessao.filter((p) => p.present).length;
        return {
          id: s.id,
          date: s.date,
          title: s.title,
          recordCount: daSessao.length,
          presentCount,
          absentCount: daSessao.length - presentCount,
        };
      });
      return Response.json({ records: rows });
    }

    const [vinculos, sessao] = await Promise.all([
      Member.findAll({ attributes: ["personId"], where: { ministryId: id, organizationId: org }, raw: true }),
      // Roda sempre, mesmo sem membros: é esta consulta que recusa um ?date=
      // que não é data, como a antiga fazia.
      MinistryAttendanceSession.findOne({
        attributes: ["id"],
        where: { ministryId: id, meetingDate: date, organizationId: org },
        raw: true,
      }),
    ]);

    // A ordem é a do BANCO (`ORDER BY full_name`), não um sort em JS: a
    // collation do Postgres e a do JavaScript discordam em acento e caixa.
    const pessoas = vinculos.length
      ? await Person.findAll({
        attributes: ["id", ["full_name", "name"], "email"],
        where: { organizationId: org, id: vinculos.map((v) => v.personId) },
        order: [["fullName", "ASC"]],
        raw: true,
      }) as unknown as { id: string; name: string; email: string | null }[]
      : [];

    const presencas = sessao && pessoas.length
      ? await MinistryAttendanceRecord.findAll({
        attributes: ["memberId", "present", "notes"],
        where: { sessionId: sessao.id, organizationId: org, memberId: pessoas.map((p) => p.id) },
        raw: true,
      })
      : [];
    const presencaDe = new Map(presencas.map((p) => [p.memberId, p]));

    const members = pessoas.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      present: presencaDe.get(p.id)?.present ?? false,
      notes: presencaDe.get(p.id)?.notes ?? null,
    }));

    return Response.json({ date, members });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("attendance.write");
    const { id } = await params;
    requireUuid(id, "Ministério não encontrado.");
    const payload = await readJson<AttendancePayload>(request);
    if (!payload.date) return Response.json({ error: "Data da chamada é obrigatória." }, { status: 400 });

    await db.transaction(async (transaction) => {
      await assertOwnedResource("ministries", id, organizationId(auth), "Ministério não encontrado.", transaction);

      // A sessão é única por ministério + data. Chamada já aberta nesse dia é
      // reaproveitada (só o updated_at anda); o id volta do RETURNING nos dois
      // casos.
      const [sessao] = await MinistryAttendanceSession.bulkCreate(
        [{ ministryId: id, organizationId: organizationId(auth), meetingDate: payload.date }],
        {
          conflictAttributes: ["ministryId", "meetingDate"],
          // `updated_at` é o nome do ATRIBUTO (ver `createdAt: "created_at"` no
          // Model); o tipo do Sequelize só conhece os campos declarados.
          updateOnDuplicate: ["updated_at" as never],
          transaction,
        },
      );
      const sessionId = sessao.id;

      const records = Array.isArray(payload.records) ? payload.records : [];
      // Só entram na chamada os membros da própria organização.
      const owned = new Set(
        await filterOwnedMemberIds(records.map((record) => record.memberId), organizationId(auth), transaction),
      );

      // Uma gravação por linha, na ordem do payload, como antes: o mesmo membro
      // duas vezes no payload fica com a última marcação, em vez de estourar o
      // "ON CONFLICT DO UPDATE cannot affect row a second time" de um insert só.
      for (const record of records) {
        if (!owned.has(record.memberId)) continue;
        await MinistryAttendanceRecord.bulkCreate([{
          sessionId,
          memberId: record.memberId,
          organizationId: organizationId(auth),
          // `?? null` e não o default do Model: `present` ausente no payload
          // continua sendo recusado pelo NOT NULL do banco, como era -- o
          // default `false` gravaria "ausente" sem ninguém ter marcado.
          present: (record.present ?? null) as boolean,
          notes: record.notes?.trim() || null,
        }], {
          conflictAttributes: ["sessionId", "memberId"],
          updateOnDuplicate: ["present", "notes", "updated_at" as never],
          returning: false,
          transaction,
        });
      }

      const ministry = await Ministry.findOne({
        attributes: ["name"],
        where: { id, organizationId: organizationId(auth) },
        transaction,
        raw: true,
      });
      await addActivity(
        transaction,
        auth,
        "members",
        "registrou presença da escola bíblica em",
        ministry?.name ?? "Ministério",
      );
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
