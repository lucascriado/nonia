import { Op, col, fn, where } from "sequelize";
import { organizationId, requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/records";
import { Activity, Event, Member, Person, Visitor } from "@/lib/models";
import { hojeNoFuso, meiaNoiteNoFuso, mesDe } from "@/lib/datas";

export const runtime = "nodejs";

type AtividadeRecente = { id: string; category: string; actor: string; action: string; subject: string | null; occurredAt: Date };

/**
 * As 5 atividades mais recentes, SEM REPETIR a mesma (categoria, autor, ação,
 * assunto): de cada grupo, só a ocorrência mais nova. Sem isso, dez edições
 * seguidas do mesmo lançamento ocupariam o painel inteiro.
 *
 * Era um `DISTINCT ON` ordenado. Aqui é a mesma regra em JS: percorre da mais
 * nova para a mais antiga e guarda a primeira de cada grupo -- que é
 * justamente a mais nova dele, e a ordem de saída continua sendo a de
 * `occurred_at` decrescente. Lê em lotes e para assim que tem 5, em vez de
 * trazer o histórico inteiro.
 *
 * `id` desempata o lote: sem ele, linhas com o mesmo `occurred_at` na fronteira
 * de dois lotes poderiam aparecer em ambos ou em nenhum.
 */
async function atividadesRecentes(organization: string, quantas = 5, lote = 100) {
  const escolhidas: AtividadeRecente[] = [];
  const vistos = new Set<string>();
  for (let offset = 0; escolhidas.length < quantas; offset += lote) {
    const linhas = await Activity.findAll({
      attributes: ["id", "category", "actor", "action", "subject", "occurredAt"],
      where: { organizationId: organization },
      order: [["occurredAt", "DESC"], ["id", "ASC"]],
      limit: lote,
      offset,
      raw: true,
    }) as unknown as AtividadeRecente[];
    for (const linha of linhas) {
      // JSON distingue null de "", e trata dois null como iguais -- como o DISTINCT ON.
      const grupo = JSON.stringify([linha.category, linha.actor, linha.action, linha.subject]);
      if (vistos.has(grupo)) continue;
      vistos.add(grupo);
      escolhidas.push(linha);
      if (escolhidas.length === quantas) break;
    }
    if (linhas.length < lote) break;
  }
  return escolhidas;
}

export async function GET() {
  try {
    const auth = await requirePermission("dashboard.read");
    /**
     * "HOJE" É O DIA DA IGREJA, e é dele que sai toda conta de mês e de data.
     *
     * Antes estas consultas usavam CURRENT_DATE, que segue o fuso da SESSÃO do
     * Postgres, que nos nossos bancos é UTC -- medido, não suposto: às 21h35 em
     * Brasília ele respondia 08/09. Nas últimas três horas de um dia 30 ou 31,
     * este painel inteiro TROCAVA DE MÊS: mostrava os aniversariantes e as
     * contagens do mês seguinte, com a pessoa olhando para uma tela que dizia
     * o mês certo no cabeçalho.
     *
     * O fuso vai junto porque o "próximos eventos" compara com timestamptz e
     * precisa da meia-noite LOCAL, não da data solta.
     */
    const tz = auth.organization.timezone;
    const hoje = hojeNoFuso(tz);
    const mes = mesDe(hoje);
    const mesDoAno = Number(hoje.slice(5, 7));
    const org = organizationId(auth);

    /**
     * CADA CONSULTA MONTA O PRÓPRIO `where`, e não um objeto comum.
     *
     * Quando isto era SQL, havia um array de parâmetros compartilhado, e ele
     * funcionava enquanto todas usavam só $1. No instante em que uma passou a
     * precisar de $2 e $3, as outras três deram 500 -- "bind message supplies 3
     * parameters, but prepared statement requires 2" -- e nem `typecheck` nem
     * `build` enxergavam. O equivalente aqui seria mutar um `where` comum e
     * vazar a condição de uma consulta para a outra. Cada uma com o seu.
     */
    const aniversarioNoMes = () => where(fn("date_part", "month", col("birth_date")), mesDoAno);

    const [totalMembers, visitorsThisMonth, activeCells, birthdaysThisMonth, activities, birthdays, events] =
      await Promise.all([
        Member.count({ where: { organizationId: org, status: "active" } }),
        Visitor.count({
          where: { organizationId: org, visitDate: { [Op.gte]: mes.inicio, [Op.lt]: mes.fim } },
        }),
        // Células DISTINTAS pelo nome, entre os membros ativos que têm uma.
        Member.count({
          where: { organizationId: org, status: "active", cellName: { [Op.ne]: "Sem célula" } },
          distinct: true,
          col: "cellName",
        }),
        Person.count({
          where: { [Op.and]: [{ organizationId: org, birthDate: { [Op.ne]: null } }, aniversarioNoMes()] },
        }),
        atividadesRecentes(org),
        Person.findAll({
          attributes: ["id", ["full_name", "name"], "birthDate"],
          where: { [Op.and]: [{ organizationId: org, birthDate: { [Op.ne]: null } }, aniversarioNoMes()] },
          order: [[fn("date_part", "day", col("birth_date")), "ASC"]],
          limit: 4,
          raw: true,
        }),
        Event.findAll({
          attributes: ["id", "title", "location", "startsAt", "color"],
          // starts_at é timestamptz, então o corte tem que ser a MEIA-NOITE
          // LOCAL da igreja, e não uma data solta: comparado com a meia-noite
          // em UTC, "a partir de hoje" começava às 21h de ontem em Brasília e o
          // culto de ontem à noite aparecia como próximo.
          //
          // No SQL isto era `($2::date)::timestamp AT TIME ZONE $3`, e o
          // ::timestamp era obrigatório: sem ele o Postgres casta a data pelo
          // fuso da SESSÃO e devolve TRÊS HORAS ANTES. O mesmo erro existe em JS
          // com `new Date(hoje)`, que é meia-noite UTC -- por isso a conta mora
          // em `meiaNoiteNoFuso`, e não aqui.
          where: { organizationId: org, startsAt: { [Op.gte]: meiaNoiteNoFuso(hoje, tz) } },
          order: [["startsAt", "ASC"]],
          limit: 6,
          raw: true,
        }),
      ]);

    return Response.json({
      stats: { totalMembers, visitorsThisMonth, activeCells, birthdaysThisMonth },
      activities,
      birthdays,
      events,
    });
  } catch (error) {
    return apiError(error);
  }
}
