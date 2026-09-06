import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { syncCellMembership } from "@/lib/cell-membership";
import { Member, Ministry, Person, Visitor } from "@/lib/models";
import { apiError, nullable, personAttributes, RecordPayload, validateRecordPayload } from "@/lib/records";
import { assertAffected } from "@/lib/tenant";
import { notFound } from "@/lib/http";
import { readJson, requireUuid } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("members.read");
    const { id } = await context.params;
    requireUuid(id, "Membro não encontrado.");

    // Traz a foto, que a listagem deixou de devolver por peso. É este o
    // caminho que o formulário de edição usa antes de abrir -- sem ele, salvar
    // mandaria a foto vazia.
    const { rows } = await query(`
      SELECT id, full_name AS name, email, phone, birth_date AS "birthDate",
        gender, marital_status AS "civilStatus", cpf, zip_code AS "zipCode",
        address, neighborhood, city, state, avatar_url AS "photoDataUrl", notes,
        ministry, ministry_color AS "ministryColor", role, status,
        baptism_status AS baptism, baptism_date AS "baptismDate",
        admission_date AS date, is_new AS "isNew", cell_name AS cell
      FROM member_directory WHERE id = $1 AND organization_id = $2
    `, [id, organizationId(auth)]);

    if (!rows.length) throw notFound("Membro não encontrado.");
    return Response.json(rows[0]);
  } catch (error) {
    return apiError(error);
  }
}


export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("members.write");
    const { id } = await context.params;
    requireUuid(id, "Membro não encontrado.");
    const payload = await readJson<RecordPayload>(request);
    const validationError = validateRecordPayload(payload);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    await db.transaction(async (transaction) => {
      const ministry = payload.ministry && payload.ministry !== "Nenhum"
        ? await Ministry.findOne({
            where: { name: payload.ministry, organizationId: organizationId(auth) },
            transaction,
          })
        : null;

      // O organization_id no WHERE é o que impede editar o membro de outra igreja.
      const [affected] = await Person.update(personAttributes(payload), {
        where: { id, organizationId: organizationId(auth) },
        transaction,
      });
      assertAffected(affected, "Membro não encontrado.");

      await Member.update({
        ministryId: ministry?.id ?? null,
        role: payload.role || "Membro Comum",
        status: payload.status === "Inativo" ? "inactive" : "active",
        baptismStatus: payload.baptismDate ? "baptized" : "waiting",
        baptismDate: nullable(payload.baptismDate),
        cellName: payload.cell || "Sem célula",
      }, { where: { personId: id, organizationId: organizationId(auth) }, transaction });

      await syncCellMembership(auth, id, payload.cell, transaction);
      await addActivity(transaction, auth, "members", "atualizou o cadastro de", payload.name);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("members.write");
    const { id } = await context.params;
    requireUuid(id, "Membro não encontrado.");

    await db.transaction(async (transaction) => {
      const person = await Person.findOne({
        where: { id, organizationId: organizationId(auth) },
        transaction,
      });
      if (!person) assertAffected(0, "Membro não encontrado.");

      const affected = await Member.destroy({
        where: { personId: id, organizationId: organizationId(auth) },
        transaction,
      });
      assertAffected(affected, "Membro não encontrado.");

      // A pessoa só some quando não é mais visitante também.
      const stillVisitor = await Visitor.count({
        where: { personId: id, organizationId: organizationId(auth) },
        transaction,
      });
      if (stillVisitor === 0) {
        await Person.destroy({ where: { id, organizationId: organizationId(auth) }, transaction });
      }

      await addActivity(transaction, auth, "members", "excluiu o cadastro de", person?.fullName);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
