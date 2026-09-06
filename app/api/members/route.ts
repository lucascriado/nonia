import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { Member, Ministry, Person } from "@/lib/models";
import { apiError, nullable, personAttributes, RecordPayload, validateRecordPayload } from "@/lib/records";
import { syncCellMembership } from "@/lib/cell-membership";
import { assertWithinPlanLimit } from "@/lib/plan-limits";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requirePermission("members.read");
    const { rows } = await query(`
      SELECT id, full_name AS name, email, phone, birth_date AS "birthDate",
        gender, marital_status AS "civilStatus", cpf, zip_code AS "zipCode",
        address, neighborhood, city, state, avatar_url AS "photoDataUrl", notes, ministry, ministry_color AS "ministryColor",
        role, status, baptism_status AS baptism, baptism_date AS "baptismDate",
        admission_date AS date, is_new AS "isNew", cell_name AS cell
      FROM member_directory
      WHERE organization_id = $1
      ORDER BY admission_date DESC, full_name
    `, [organizationId(auth)]);
    return Response.json(rows);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("members.write");
    const payload = await request.json() as RecordPayload;
    const validationError = validateRecordPayload(payload);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const id = await db.transaction(async (transaction) => {
      await assertWithinPlanLimit(auth, "members", transaction);

      const person = await Person.create(
        { ...personAttributes(payload), organizationId: organizationId(auth) },
        { transaction },
      );
      // Ministério é resolvido pelo nome dentro da organização.
      const ministry = payload.ministry && payload.ministry !== "Nenhum"
        ? await Ministry.findOne({
            where: { name: payload.ministry, organizationId: organizationId(auth) },
            transaction,
          })
        : null;

      await Member.create({
        personId: person.id,
        organizationId: organizationId(auth),
        ministryId: ministry?.id ?? null,
        role: payload.role || "Membro Comum",
        status: payload.status === "Inativo" ? "inactive" : "active",
        baptismStatus: payload.baptismDate ? "baptized" : "waiting",
        baptismDate: nullable(payload.baptismDate),
        isNew: true,
        cellName: payload.cell || "Sem célula",
      }, { transaction });
      await syncCellMembership(auth, person.id, payload.cell, transaction);
      await addActivity(transaction, auth, "members", "cadastrou um novo membro", payload.name);
      return person.id;
    });

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
