import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { syncCellMembership } from "@/lib/cell-membership";
import { filtrosDeMembros, paginacao } from "@/lib/listings";
import { assertWithinPlanLimit } from "@/lib/plan-limits";
import { Member, Ministry, Person } from "@/lib/models";
import { readJson } from "@/lib/http";
import { apiError, nullable, personAttributes, RecordPayload, validateRecordPayload } from "@/lib/records";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("members.read");
    const { searchParams } = new URL(request.url);

    // Filtro e paginação no SERVIDOR, e nesta ordem: filtra primeiro, pagina
    // depois. Paginar aqui e continuar filtrando na tela faria a busca olhar
    // só os 25 visíveis -- a pessoa digitaria um nome e não acharia ninguém,
    // sem desconfiar da paginação.
    const filtro = filtrosDeMembros(searchParams, organizationId(auth));
    const { page, pageSize, offset } = paginacao(searchParams);
    const where = filtro.where.join(" AND ");

    // O total é o do conjunto FILTRADO, não o da organização: senão a tela
    // diria "137 resultados" mostrando 4.
    const contagem = await query<{ total: number }>(
      `SELECT count(*)::int AS total FROM member_directory WHERE ${where}`,
      filtro.valores,
    );

    const { rows } = await query(`
      SELECT id, full_name AS name, email, phone, birth_date AS "birthDate",
        gender, marital_status AS "civilStatus", cpf, zip_code AS "zipCode",
        address, neighborhood, city, state, notes, ministry, ministry_color AS "ministryColor",
        -- A foto NÃO vem na listagem: era base64 de até 120 KB por pessoa, e
        -- 100 membros custavam 8,6 MB. A tela usa iniciais e busca a pessoa
        -- por id quando precisa da foto.
        avatar_url IS NOT NULL AS "hasPhoto",
        role, status, baptism_status AS baptism, baptism_date AS "baptismDate",
        admission_date AS date, is_new AS "isNew", cell_name AS cell
      FROM member_directory
      WHERE ${where}
      ORDER BY admission_date DESC, full_name
      LIMIT $${filtro.valores.length + 1} OFFSET $${filtro.valores.length + 2}
    `, [...filtro.valores, pageSize, offset]);

    return Response.json({ records: rows, total: contagem.rows[0].total, page, pageSize });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("members.write");
    const payload = await readJson<RecordPayload>(request);
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
