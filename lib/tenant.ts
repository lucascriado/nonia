import { QueryTypes, type Transaction } from "sequelize";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/http";

type Scoped = "people" | "ministries" | "cells" | "members";

/**
 * Confere que um id informado no payload pertence à organização da sessão.
 * Sem isso, um `ministryId` de outra igreja entraria por um campo de
 * formulário -- o banco só barra as referências que têm FK composta.
 */
export async function assertBelongsToOrganization(
  table: Scoped,
  column: "id" | "person_id",
  value: string,
  organizationId: string,
  transaction?: Transaction,
) {
  const rows = await db.query<{ ok: number }>(
    `SELECT 1 AS ok FROM ${table} WHERE ${column} = $1 AND organization_id = $2`,
    { bind: [value, organizationId], transaction, type: QueryTypes.SELECT },
  );
  // Acontece quando a tela mandou um id que não é desta igreja -- em geral
  // porque a lista estava velha. A mensagem diz o que fazer, não só o que
  // deu errado.
  if (!rows.length) {
    throw badRequest(
      "O registro selecionado não pertence a esta igreja. Atualize a página e escolha de novo.",
      "cross_tenant",
    );
  }
}

/** Filtra ids mantendo só os que são da organização. */
export async function filterOwnedMemberIds(
  ids: string[],
  organizationId: string,
  transaction?: Transaction,
): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await db.query<{ personId: string }>(
    `SELECT person_id AS "personId" FROM members WHERE organization_id = $1 AND person_id = ANY($2::uuid[])`,
    { bind: [organizationId, ids], transaction, type: QueryTypes.SELECT },
  );
  return rows.map((row) => row.personId);
}

/**
 * Filtra ids de PESSOA mantendo só os que são da organização.
 *
 * Irmã de `filterOwnedMemberIds`, e a diferença importa: aquela consulta
 * `members`, ou seja só quem TEM ficha de membro. Esta consulta `people`, que é
 * quem a pessoa é. Usada pelos responsáveis do evento, que apontam para
 * `people` justamente para não sumirem do histórico quando alguém deixa de ser
 * membro -- filtrar por `members` ali reintroduziria, na validação, a
 * dependência que a modelagem tirou.
 */
export async function filterOwnedPersonIds(
  ids: string[],
  organizationId: string,
  transaction?: Transaction,
): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM people WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
    { bind: [organizationId, ids], transaction, type: QueryTypes.SELECT },
  );
  return rows.map((row) => row.id);
}

/** Traduz "0 linhas afetadas" em 404, para não confundir com sucesso. */
export function assertAffected(affected: number, message = "Registro não encontrado.") {
  if (!affected) throw notFound(message);
}

/**
 * Igual à anterior, mas para o recurso identificado na própria URL: responde
 * 404, e não 400, para que um id de outra organização seja indistinguível de
 * um id inexistente.
 */
export async function assertOwnedResource(
  table: Scoped,
  value: string,
  organizationId: string,
  message: string,
  transaction?: Transaction,
) {
  const rows = await db.query<{ ok: number }>(
    `SELECT 1 AS ok FROM ${table} WHERE id = $1 AND organization_id = $2`,
    { bind: [value, organizationId], transaction, type: QueryTypes.SELECT },
  );
  if (!rows.length) throw notFound(message);
}
