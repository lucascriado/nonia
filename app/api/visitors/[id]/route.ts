import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { Member, Person, Visitor, VisitorDirectory } from "@/lib/models";
import { readJson, requireUuid } from "@/lib/http";
import { apiError, personAttributes, RecordPayload, validateRecordPayload } from "@/lib/records";
import { assertAffected } from "@/lib/tenant";
import { notFound } from "@/lib/http";
import { membershipStage, visitorStatus } from "@/lib/visitor-stages";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("visitors.read");
    const { id } = await context.params;
    requireUuid(id, "Visitante não encontrado.");

    // Com a foto, que a listagem não traz mais. Ver o GET de membros.
    //
    // No apelido `[coluna, nome]` a coluna é a do BANCO (`full_name`), não o
    // atributo do Model -- ver lib/members/queries.ts.
    const visitante = await VisitorDirectory.findOne({
      attributes: [
        "id", ["full_name", "name"], "email", "phone", "birthDate",
        "gender", ["marital_status", "civilStatus"], "cpf", "zipCode",
        "address", "neighborhood", "city", "state", ["avatar_url", "photoDataUrl"], "notes",
        ["visit_date", "date"], "invitedBy", "membershipStage",
      ],
      where: { id, organizationId: organizationId(auth) },
      raw: true,
    });

    if (!visitante) throw notFound("Visitante não encontrado.");
    return Response.json(visitante);
  } catch (error) {
    return apiError(error);
  }
}


export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("visitors.write");
    const { id } = await context.params;
    requireUuid(id, "Visitante não encontrado.");
    const payload = await readJson<RecordPayload>(request);
    const validationError = validateRecordPayload(payload);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    await db.transaction(async (transaction) => {
      const [affected] = await Person.update(personAttributes(payload), {
        where: { id, organizationId: organizationId(auth) },
        transaction,
      });
      assertAffected(affected, "Visitante não encontrado.");

      await Visitor.update({
        invitedBy: payload.invitedBy || "Espontâneo",
        followUpStatus: visitorStatus(payload.membershipStage),
        membershipStage: membershipStage(payload.membershipStage),
      }, { where: { personId: id, organizationId: organizationId(auth) }, transaction });

      await addActivity(transaction, auth, "visitors", "atualizou o acompanhamento de", payload.name);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("visitors.write");
    const { id } = await context.params;
    requireUuid(id, "Visitante não encontrado.");

    await db.transaction(async (transaction) => {
      const person = await Person.findOne({
        where: { id, organizationId: organizationId(auth) },
        transaction,
      });
      if (!person) assertAffected(0, "Visitante não encontrado.");

      const affected = await Visitor.destroy({
        where: { personId: id, organizationId: organizationId(auth) },
        transaction,
      });
      assertAffected(affected, "Visitante não encontrado.");

      const stillMember = await Member.count({
        where: { personId: id, organizationId: organizationId(auth) },
        transaction,
      });
      if (stillMember === 0) {
        await Person.destroy({ where: { id, organizationId: organizationId(auth) }, transaction });
      }

      await addActivity(transaction, auth, "visitors", "excluiu o registro de visita de", person?.fullName);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
