import { query } from "@/lib/db";
import type { Filtro, Pagina } from "@/lib/listings";

// Consultas de LEITURA de membros, num lugar só.
//
// Tudo aqui lê da view `member_directory` e recebe o tenant de quem chama --
// pelo `Filtro` (cuja primeira condição é sempre `organization_id = $1`, ver
// lib/listings.ts) ou por parâmetro explícito. Nenhuma função daqui sabe de
// sessão nem de HTTP: permissão é da rota, regra de escrita é do service.

export type ResumoDeMembros = {
  total: number;
  newThisMonth: number;
  active: number;
  baptized: number;
  awaitingBaptism: number;
};

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
  const { rows } = await query<ResumoDeMembros>(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (
         WHERE admission_date >= date_trunc('month', $${filtro.valores.length + 1}::date)::date
           AND admission_date <  (date_trunc('month', $${filtro.valores.length + 1}::date) + interval '1 month')::date
       )::int AS "newThisMonth",
       count(*) FILTER (WHERE status = 'active')::int AS active,
       count(*) FILTER (WHERE baptism_status = 'baptized')::int AS baptized,
       count(*) FILTER (WHERE baptism_status = 'waiting')::int AS "awaitingBaptism"
     FROM member_directory WHERE ${filtro.where.join(" AND ")}`,
    [...filtro.valores, hoje],
  );
  return rows[0];
}

/**
 * Uma página da listagem.
 *
 * `compromissos` -- O QUE A PESSOA JÁ ASSUMIU EM MINISTÉRIO, para o seletor de
 * pessoas do ministério pintar de cinza quem já está comprometido. É OPT-IN e
 * não campo novo em toda listagem: esta é a consulta mais pesada do sistema, e
 * dois JOINs a mais em toda abertura de /membros seriam pagos por quem nunca
 * vai abrir um seletor de ministério.
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
  { compromissos = false }: { compromissos?: boolean } = {},
) {
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
      ${compromissos ? `,
      -- Os ministérios que esta pessoa LIDERA. Lista, porque liderar mais de
      -- um é permitido pelo schema.
      COALESCE((
        SELECT json_agg(json_build_object('id', li.id, 'name', li.name) ORDER BY li.name)
          FROM ministries li
         WHERE li.leader_id = member_directory.id
           AND li.organization_id = member_directory.organization_id
      ), '[]') AS lidera,
      -- O ministério a que ela PERTENCE. Um, ou nenhum -- ver o bloco acima.
      (
        SELECT json_build_object('id', mi.id, 'name', mi.name)
          FROM members me
          JOIN ministries mi ON mi.id = me.ministry_id
                            AND mi.organization_id = me.organization_id
         WHERE me.person_id = member_directory.id
           AND me.organization_id = member_directory.organization_id
      ) AS ministerio` : ""}
    FROM member_directory
    WHERE ${filtro.where.join(" AND ")}
    ORDER BY admission_date DESC, full_name
    LIMIT $${filtro.valores.length + 1} OFFSET $${filtro.valores.length + 2}
  `, [...filtro.valores, pageSize, offset]);
  return rows;
}

/**
 * Um membro, COM a foto -- que a listagem deixou de devolver por peso. É este
 * o caminho que o formulário de edição usa antes de abrir: sem ele, salvar
 * mandaria a foto vazia. `null` quando não existe NESTA organização.
 */
export async function buscarMembro(id: string, organizationId: string) {
  const { rows } = await query(`
    SELECT id, full_name AS name, email, phone, birth_date AS "birthDate",
      gender, marital_status AS "civilStatus", cpf, zip_code AS "zipCode",
      address, neighborhood, city, state, avatar_url AS "photoDataUrl", notes,
      ministry, ministry_color AS "ministryColor", role, status,
      baptism_status AS baptism, baptism_date AS "baptismDate",
      admission_date AS date, cell_name AS cell
    FROM member_directory WHERE id = $1 AND organization_id = $2
  `, [id, organizationId]);
  return rows[0] ?? null;
}

/**
 * Tudo o que casa com o filtro, para o CSV. NÃO pagina, de propósito: a
 * exportação leva tudo. Colunas cruas, sem alias -- quem traduz para o
 * cabeçalho em português é a rota de exportação.
 */
export async function membrosParaExportar(filtro: Filtro) {
  const { rows } = await query<Record<string, string | null>>(
    `SELECT full_name, email, phone, birth_date, gender, marital_status, cpf, zip_code,
            address, neighborhood, city, state, ministry, cell_name, role, status,
            baptism_status, baptism_date, admission_date, notes
     FROM member_directory
     WHERE ${filtro.where.join(" AND ")}
     ORDER BY full_name`,
    filtro.valores,
  );
  return rows;
}
