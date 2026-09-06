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
    // diria "137 resultados" mostrando 4. Os indicadores saem da MESMA
    // consulta e sob o MESMO filtro: indicador que ignora o filtro ao lado de
    // uma lista que o obedece é o número errado que ninguém questiona.
    //
    // "Novos este mês" é admissão dentro do mês corrente, e NÃO a marca
    // `is_new`: ela nasce true na criação e nunca volta a false, então contá-la
    // diria "novo este mês" sobre quem entrou em 2022. Medido no nonia_dev em
    // 06/09/2026: `is_new` dava 7, admitidos no mês davam 1.
    const contagem = await query<{
      total: number; newThisMonth: number; active: number;
      baptized: number; awaitingBaptism: number;
    }>(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (
           WHERE admission_date >= date_trunc('month', CURRENT_DATE)::date
             AND admission_date <  (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
         )::int AS "newThisMonth",
         count(*) FILTER (WHERE status = 'active')::int AS active,
         count(*) FILTER (WHERE baptism_status = 'baptized')::int AS baptized,
         count(*) FILTER (WHERE baptism_status = 'waiting')::int AS "awaitingBaptism"
       FROM member_directory WHERE ${where}`,
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
        admission_date AS date, cell_name AS cell
      FROM member_directory
      WHERE ${where}
      ORDER BY admission_date DESC, full_name
      LIMIT $${filtro.valores.length + 1} OFFSET $${filtro.valores.length + 2}
    `, [...filtro.valores, pageSize, offset]);

    const { total, ...summary } = contagem.rows[0];
    return Response.json({ records: rows, total, page, pageSize, summary });
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
