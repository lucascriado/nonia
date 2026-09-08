import { organizationId, requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/records";
import { query } from "@/lib/db";
import { hojeNoFuso, FUSO_PADRAO } from "@/lib/datas";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requirePermission("dashboard.read");
    /**
     * "HOJE" É O DIA DA IGREJA, e entra como parâmetro em toda consulta que
     * antes usava CURRENT_DATE.
     *
     * CURRENT_DATE segue o fuso da SESSÃO do Postgres, que nos nossos bancos é
     * UTC -- medido, não suposto: às 21h35 em Brasília ele respondia 08/09.
     * Nas últimas três horas de um dia 30 ou 31, este painel inteiro TROCAVA DE
     * MÊS: mostrava os aniversariantes e as contagens do mês seguinte, com a
     * pessoa olhando para uma tela que dizia o mês certo no cabeçalho.
     *
     * O fuso vai junto porque o "próximos eventos" compara com timestamptz e
     * precisa da meia-noite LOCAL, não da data solta.
     */
    const hoje = hojeNoFuso(auth.organization.timezone);
    const fuso = auth.organization.timezone || FUSO_PADRAO;

    /**
     * CADA CONSULTA RECEBE EXATAMENTE OS PARÂMETROS QUE USA, e não um array
     * comum. Havia um `tenant` único aqui, e ele funcionava enquanto todas
     * usavam só $1.
     *
     * No instante em que uma delas passou a precisar de $2 e $3, o array comum
     * virou uma armadilha: o Postgres RECUSA bind com parâmetro sobrando --
     * "bind message supplies 3 parameters, but prepared statement requires 2".
     * Três das quatro consultas deste arquivo passariam a dar 500, e nem
     * `typecheck` nem `build` enxergam isso: para o TypeScript é um
     * `unknown[]` legítimo dos dois lados. Só aparece chamando o banco.
     */
    const soTenant = [organizationId(auth)];
    const tenantEHoje = [organizationId(auth), hoje];
    const tenantHojeEFuso = [organizationId(auth), hoje, fuso];

    const [stats, activities, birthdays, events] = await Promise.all([
      query<{ totalMembers: number; visitorsThisMonth: number; activeCells: number; birthdaysThisMonth: number }>(`
        SELECT
          (SELECT count(*)::int FROM members WHERE organization_id=$1 AND status='active') AS "totalMembers",
          (SELECT count(*)::int FROM visitors WHERE organization_id=$1 AND date_trunc('month', visit_date)=date_trunc('month', $2::date)) AS "visitorsThisMonth",
          (SELECT count(DISTINCT cell_name)::int FROM members WHERE organization_id=$1 AND status='active' AND cell_name <> 'Sem célula') AS "activeCells",
          (SELECT count(*)::int FROM people WHERE organization_id=$1 AND birth_date IS NOT NULL AND EXTRACT(MONTH FROM birth_date)=EXTRACT(MONTH FROM $2::date)) AS "birthdaysThisMonth"
      `, tenantEHoje),
      query<{ id: string; category: string; actor: string; action: string; subject: string; occurredAt: string }>(`
        SELECT id, category, actor, action, subject, occurred_at AS "occurredAt"
        FROM (
          SELECT DISTINCT ON (category, actor, action, subject)
            id, category, actor, action, subject, occurred_at
          FROM activities
          WHERE organization_id = $1
          ORDER BY category, actor, action, subject, occurred_at DESC
        ) recent_unique
        ORDER BY occurred_at DESC
        LIMIT 5
      `, soTenant),
      query<{ id: string; name: string; birthDate: string }>(`
        SELECT id, full_name AS name, birth_date AS "birthDate"
        FROM people
        WHERE organization_id = $1
          AND birth_date IS NOT NULL AND EXTRACT(MONTH FROM birth_date)=EXTRACT(MONTH FROM $2::date)
        ORDER BY EXTRACT(DAY FROM birth_date) LIMIT 4
      `, tenantEHoje),
      query<{ id: string; title: string; location: string; startsAt: string; color: string }>(`
        SELECT id, title, location, starts_at AS "startsAt", color
        -- starts_at é timestamptz, então o corte tem que ser a MEIA-NOITE
        -- LOCAL da igreja, e não uma data solta: comparado com CURRENT_DATE em
        -- UTC, "a partir de hoje" começava às 21h de ontem em Brasília e o
        -- culto desta noite sumia da lista de próximos.
        --
        -- O ::timestamp é OBRIGATÓRIO e não é ruído. Sem ele o Postgres resolve
        -- date AT TIME ZONE pelo outro caminho: casta a data para timestamptz
        -- usando o fuso da SESSÃO e depois CONVERTE para hora local, devolvendo
        -- timestamp -- o sentido invertido. Medido, com sessão em UTC:
        --   '2026-09-07'::date AT TIME ZONE 'America/Sao_Paulo'
        --     -> 2026-09-06 21:00   (timestamp, três horas ANTES do que se quer)
        --   ('2026-09-07'::date)::timestamp AT TIME ZONE 'America/Sao_Paulo'
        --     -> 2026-09-07 03:00+00 (timestamptz, a meia-noite em Brasília)
        -- Sem o cast, o painel passaria a mostrar como "próximo" um evento de
        -- ontem à noite -- um defeito mais sutil que o que se estava consertando.
        FROM events WHERE organization_id = $1 AND starts_at >= ($2::date)::timestamp AT TIME ZONE $3
        ORDER BY starts_at LIMIT 6
      `, tenantHojeEFuso),
    ]);
    return Response.json({ stats: stats.rows[0], activities: activities.rows, birthdays: birthdays.rows, events: events.rows });
  } catch (error) {
    return apiError(error);
  }
}
