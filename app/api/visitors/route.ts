import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { Person, Visitor } from "@/lib/models";
import { readJson } from "@/lib/http";
import { apiError, personAttributes, RecordPayload, validateRecordPayload } from "@/lib/records";
import { filtrosDeVisitantes, paginacao } from "@/lib/listings";
import { membershipStage, visitorStatus } from "@/lib/visitor-stages";
import { hojeNoFuso } from "@/lib/datas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("visitors.read");
    const { searchParams } = new URL(request.url);

    // Ver o comentário em /api/members: filtra no servidor e só então pagina.
    const filtro = filtrosDeVisitantes(searchParams, organizationId(auth), auth.organization.timezone);
    const { page, pageSize, offset } = paginacao(searchParams);
    const where = filtro.where.join(" AND ");

    // Indicadores na mesma consulta e sob o mesmo filtro do total -- ver o
    // comentário em /api/members.
    //
    // Os três particionam o conjunto: primeira visita + intermediários +
    // marcados como membro somam sempre o total. Isso vale porque converter um
    // visitante APAGA a linha dele (POST /api/visitors/[id]/convert), e é essa
    // exclusão que dá o sentido de `markedAsMember`: são as pessoas com a etapa
    // "Membro" que CONTINUAM na lista de visitantes, ou seja, as que ninguém
    // converteu. Não é "quantos viraram membros" -- esses não estão mais aqui.
    const contagem = await query<{
      total: number; firstVisit: number; integrating: number; markedAsMember: number;
    }>(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE membership_stage = 'visited')::int AS "firstVisit",
         count(*) FILTER (WHERE membership_stage NOT IN ('visited', 'member'))::int AS integrating,
         count(*) FILTER (WHERE membership_stage = 'member')::int AS "markedAsMember"
       FROM visitor_directory WHERE ${where}`,
      filtro.valores,
    );

    const { rows } = await query(`
      SELECT id, full_name AS name, email, phone, birth_date AS "birthDate",
        gender, marital_status AS "civilStatus", cpf, zip_code AS "zipCode",
        address, neighborhood, city, state, notes, visit_date AS date,
        avatar_url IS NOT NULL AS "hasPhoto",
        invited_by AS "invitedBy", membership_stage AS "membershipStage"
      FROM visitor_directory
      WHERE ${where}
      ORDER BY visit_date DESC, full_name
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
    const auth = await requirePermission("visitors.write");
    const payload = await readJson<RecordPayload>(request);
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
        // A DATA DA VISITA VEM DA APLICAÇÃO, no fuso da igreja.
        //
        // Antes ela não era passada e quem gravava era o DEFAULT CURRENT_DATE
        // do banco, que roda no fuso da SESSÃO do Postgres -- UTC. Das 21h à
        // meia-noite em Brasília, isso registrava a visita como sendo de
        // AMANHÃ. É o pior lugar possível para esse defeito: visitante é
        // cadastrado logo depois do culto de domingo à noite, exatamente
        // dentro da janela quebrada. E a data alimenta a aba "Recentes" e o
        // "visitantes este mês" do painel.
        //
        // O default do banco continua lá por enquanto, e sai numa migration
        // PRÓPRIA, num deploy POSTERIOR a este: o Dockerfile roda
        // "migrate && server", então uma migration que dropasse o default no
        // mesmo deploy o removeria enquanto o container VELHO -- com o código
        // que omite a coluna -- ainda atende requisição.
        visitDate: hojeNoFuso(auth.organization.timezone),
        invitedBy: payload.invitedBy || "Espontâneo",
        followUpStatus: visitorStatus(payload.membershipStage),
        membershipStage: membershipStage(payload.membershipStage),
      }, { transaction });
      await addActivity(transaction, auth, "visitors", "registrou uma nova visita de", payload.name);
      return person.id;
    });

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
