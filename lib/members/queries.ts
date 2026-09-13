import { Op, cast, col, fn } from "sequelize";
import { mesDe } from "@/lib/datas";
import type { Filtro, Pagina } from "@/lib/listings";
import { Member, MemberDirectory, Ministry } from "@/lib/models";

// Consultas de LEITURA de membros, num lugar só.
//
// Tudo aqui lê da view `member_directory` (Model `MemberDirectory`) e recebe o
// tenant de quem chama -- pelo `Filtro`, cuja primeira condição é sempre o
// `organizationId` (ver lib/listings.ts), ou por parâmetro explícito. Nenhuma
// função daqui sabe de sessão nem de HTTP: permissão é da rota, regra de
// escrita é do service.

/** O `filtro` mais uma condição, sem nunca perder o tenant que ele carrega. */
const e = (filtro: Filtro, condicao: object) => ({ [Op.and]: [filtro, condicao] });

/**
 * Total e indicadores da listagem, sob o MESMO filtro dela.
 *
 * O total é o do conjunto FILTRADO, não o da organização: senão a tela diria
 * "137 resultados" mostrando 4. Indicador que ignora o filtro ao lado de uma
 * lista que o obedece é o número errado que ninguém questiona.
 *
 * "Novos este mês" é admissão dentro do mês corrente, e NÃO a marca `is_new`:
 * ela nasce true na criação e nunca volta a false, então contá-la diria "novo
 * este mês" sobre quem entrou em 2022. Medido no nonia_dev em 06/09/2026:
 * `is_new` dava 7, admitidos no mês davam 1.
 *
 * E "o mês corrente" é o da IGREJA -- `hoje` vem de `hojeNoFuso`. Era
 * date_trunc sobre CURRENT_DATE, que segue o fuso da sessão do Postgres: nas
 * últimas três horas do dia 30 ou 31, o indicador pulava para o mês seguinte e
 * zerava -- logo depois de um domingo de recepção de novos membros, que é
 * quando ele mais importa.
 */
export async function resumoDeMembros(filtro: Filtro, hoje: string) {
  const mes = mesDe(hoje);
  const [total, newThisMonth, active, baptized, awaitingBaptism] = await Promise.all([
    MemberDirectory.count({ where: filtro }),
    MemberDirectory.count({ where: e(filtro, { admissionDate: { [Op.gte]: mes.inicio, [Op.lt]: mes.fim } }) }),
    MemberDirectory.count({ where: e(filtro, { status: "active" }) }),
    MemberDirectory.count({ where: e(filtro, { baptismStatus: "baptized" }) }),
    MemberDirectory.count({ where: e(filtro, { baptismStatus: "waiting" }) }),
  ]);
  return { total, newThisMonth, active, baptized, awaitingBaptism };
}

/**
 * As colunas que a tela usa, com os nomes que o JSON sempre teve.
 *
 * No apelido `[coluna, nome]` a coluna é a do BANCO (`full_name`), não o
 * atributo do Model: o Sequelize não traduz o primeiro item do par, e
 * `["fullName", "name"]` vira `"fullName" AS "name"`, coluna que não existe.
 */
const COLUNAS = [
  "id", ["full_name", "name"], "email", "phone", "birthDate",
  "gender", ["marital_status", "civilStatus"], "cpf", "zipCode",
  "address", "neighborhood", "city", "state", "notes", "ministry", "ministryColor",
  "role", "status", ["baptism_status", "baptism"], "baptismDate",
  ["admission_date", "date"], ["cell_name", "cell"],
] as const;

type Compromissos = {
  lidera: { id: string; name: string }[];
  ministerio: { id: string; name: string } | null;
};

/**
 * Uma página da listagem.
 *
 * `compromissos` -- O QUE A PESSOA JÁ ASSUMIU EM MINISTÉRIO, para o seletor de
 * pessoas do ministério pintar de cinza quem já está comprometido. É OPT-IN e
 * não campo novo em toda listagem: esta é a consulta mais pesada do sistema, e
 * as duas buscas a mais seriam pagas em toda abertura de /membros por quem
 * nunca vai abrir um seletor de ministério.
 *
 * A RESPOSTA É ASSIMÉTRICA, e a assimetria é do SCHEMA, não do gosto de quem
 * escreveu a consulta:
 *
 *   lidera[]     LISTA. `ministries.leader_id` não tem UNIQUE, então a mesma
 *                pessoa lidera quantos ministérios quiser.
 *   ministerio   UM SÓ, ou null. `members.ministry_id` é uma coluna anulável
 *                em `members`, cuja PK é `person_id`: cada pessoa pertence a
 *                NO MÁXIMO UM ministério. Não existe tabela de junção.
 *
 * O plural exigiria uma `ministry_members` e uma migration de verdade --
 * decisão, não detalhe de contrato. Enquanto ela não existir, `ministerio` é
 * singular e a tela não deve prometer mais do que isso.
 */
export async function listarMembros(
  filtro: Filtro,
  { pageSize, offset }: Pagina,
  { compromissos = false, organizationId }: { compromissos?: boolean; organizationId?: string } = {},
) {
  const membros = await MemberDirectory.findAll({
    attributes: [
      ...COLUNAS.map((c) => (typeof c === "string" ? c : [...c] as [string, string])),
      // A foto NÃO vem na listagem: era base64 de até 120 KB por pessoa, e 100
      // membros custavam 8,6 MB. A tela usa iniciais e busca a pessoa por id
      // quando precisa da foto.
      [cast(fn("num_nonnulls", col("avatar_url")), "boolean"), "hasPhoto"],
    ],
    where: filtro,
    order: [["admissionDate", "DESC"], ["fullName", "ASC"]],
    limit: pageSize,
    offset,
    raw: true,
  }) as unknown as Record<string, unknown>[];

  if (!compromissos || !organizationId || membros.length === 0) return membros;

  const ids = membros.map((m) => m.id as string);
  const [liderados, vinculos] = await Promise.all([
    Ministry.findAll({
      attributes: ["id", "name", "leaderId"],
      where: { organizationId, leaderId: ids },
      order: [["name", "ASC"]],
      raw: true,
    }),
    Member.findAll({
      attributes: ["personId", "ministryId"],
      where: { organizationId, personId: ids, ministryId: { [Op.ne]: null } },
      raw: true,
    }),
  ]);
  const ministerios = new Map(
    (await Ministry.findAll({
      attributes: ["id", "name"],
      where: { organizationId, id: vinculos.map((v) => v.ministryId as string) },
      raw: true,
    })).map((m) => [m.id, { id: m.id, name: m.name }]),
  );

  return membros.map((m): Record<string, unknown> & Compromissos => ({
    ...m,
    lidera: liderados.filter((l) => l.leaderId === m.id).map((l) => ({ id: l.id, name: l.name })),
    ministerio: ministerios.get(vinculos.find((v) => v.personId === m.id)?.ministryId ?? "") ?? null,
  }));
}

/**
 * Um membro, COM a foto -- que a listagem deixou de devolver por peso. É este
 * o caminho que o formulário de edição usa antes de abrir: sem ele, salvar
 * mandaria a foto vazia. `null` quando não existe NESTA organização.
 */
export async function buscarMembro(id: string, organizationId: string) {
  return MemberDirectory.findOne({
    attributes: [
      ...COLUNAS.map((c) => (typeof c === "string" ? c : [...c] as [string, string])),
      ["avatar_url", "photoDataUrl"],
    ],
    where: { id, organizationId },
    raw: true,
  });
}

/**
 * Tudo o que casa com o filtro, para o CSV. NÃO pagina, de propósito: a
 * exportação leva tudo.
 */
export async function membrosParaExportar(filtro: Filtro) {
  return MemberDirectory.findAll({
    attributes: [
      "fullName", "email", "phone", "birthDate", "gender", "maritalStatus", "cpf", "zipCode",
      "address", "neighborhood", "city", "state", "ministry", "cellName", "role", "status",
      "baptismStatus", "baptismDate", "admissionDate", "notes",
    ],
    where: filtro,
    order: [["fullName", "ASC"]],
    raw: true,
  });
}
