import { QueryTypes, type Transaction } from "sequelize";
import { db } from "@/lib/db";
import { organizationId, type AuthContext } from "@/lib/auth";
import { filterOwnedMemberIds } from "@/lib/tenant";

/**
 * Mantém `cell_members` coerente com o nome de célula gravado no membro.
 * Todas as escritas ficam presas à organização da sessão.
 */
export async function syncCellMembership(
  auth: AuthContext,
  memberId: string,
  cellName: string | undefined,
  transaction: Transaction,
) {
  await db.query(`DELETE FROM cell_members WHERE member_id = $1 AND organization_id = $2`, {
    bind: [memberId, organizationId(auth)],
    transaction,
  });
  if (!cellName || cellName === "Sem célula") return;

  const rows = await db.query<{ id: string }>(
    `SELECT id FROM cells WHERE name = $1 AND organization_id = $2`,
    { bind: [cellName, organizationId(auth)], transaction, type: QueryTypes.SELECT },
  );
  const cell = rows[0];
  if (!cell) return;

  const [owned] = await filterOwnedMemberIds([memberId], organizationId(auth), transaction);
  if (!owned) return;

  await db.query(
    `INSERT INTO cell_members (cell_id, member_id, organization_id) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    { bind: [cell.id, memberId, organizationId(auth)], transaction },
  );
}

/** Move um conjunto de membros para uma célula, ignorando ids de outra igreja. */
export async function assignMembersToCell(
  auth: AuthContext,
  cellId: string,
  cellName: string,
  memberIds: string[],
  transaction: Transaction,
) {
  const owned = await filterOwnedMemberIds(memberIds, organizationId(auth), transaction);

  for (const memberId of owned) {
    await db.query(`DELETE FROM cell_members WHERE member_id = $1 AND organization_id = $2`, {
      bind: [memberId, organizationId(auth)],
      transaction,
    });
    await db.query(
      `INSERT INTO cell_members (cell_id, member_id, organization_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      { bind: [cellId, memberId, organizationId(auth)], transaction },
    );
    await db.query(`UPDATE members SET cell_name = $1 WHERE person_id = $2 AND organization_id = $3`, {
      bind: [cellName, memberId, organizationId(auth)],
      transaction,
    });
  }
}
