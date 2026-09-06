import { QueryTypes, type Transaction } from "sequelize";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/http";

/**
 * Confere que um id informado no payload pertence à organização da sessão.
 * Sem isso, um `ministryId` de outra igreja entraria por um campo de
 * formulário -- o banco só barra as referências que têm FK composta.
 */
export async function assertBelongsToOrganization(
  table: "people" | "ministries" | "cells" | "members",
  column: "id" | "person_id",
  value: string,
  organizationId: string,
  transaction?: Transaction,
) {
  const rows = await db.query<{ ok: number }>(
    `SELECT 1 AS ok FROM ${table} WHERE ${column} = $1 AND organization_id = $2`,
    { bind: [value, organizationId], transaction, type: QueryTypes.SELECT },
  );
  if (!rows.length) throw badRequest("Registro informado não pertence a esta organização.", "cross_tenant");
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

/** Traduz "0 linhas afetadas" em 404, para não confundir com sucesso. */
export function assertAffected(affected: number, message = "Registro não encontrado.") {
  if (!affected) throw notFound(message);
}
