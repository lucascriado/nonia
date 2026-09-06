import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { Person, Visitor } from "@/lib/models";
import { apiError, personAttributes, RecordPayload, validateRecordPayload } from "@/lib/records";
import { membershipStage, visitorStatus } from "@/lib/visitor-stages";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requirePermission("visitors.read");
    const { rows } = await query(`
      SELECT id, full_name AS name, email, phone, birth_date AS "birthDate",
        gender, marital_status AS "civilStatus", cpf, zip_code AS "zipCode",
        address, neighborhood, city, state, avatar_url AS "photoDataUrl", notes, visit_date AS date,
        invited_by AS "invitedBy", membership_stage AS "membershipStage", is_recent AS recent
      FROM visitor_directory
      WHERE organization_id = $1
      ORDER BY visit_date DESC, full_name
    `, [organizationId(auth)]);
    return Response.json(rows);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("visitors.write");
    const payload = await request.json() as RecordPayload;
    const validationError = validateRecordPayload(payload);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const id = await db.transaction(async (transaction) => {
      const person = await Person.create(
        { ...personAttributes(payload), organizationId: organizationId(auth) },
        { transaction },
      );
      await Visitor.create({
        personId: person.id,
        organizationId: organizationId(auth),
        invitedBy: payload.invitedBy || "Espontâneo",
        followUpStatus: visitorStatus(payload.membershipStage),
        membershipStage: membershipStage(payload.membershipStage),
        isRecent: true,
      }, { transaction });
      await addActivity(transaction, auth, "visitors", "registrou uma nova visita de", payload.name);
      return person.id;
    });

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
