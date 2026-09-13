import type { Transaction } from "sequelize";
import { organizationId, type AuthContext } from "@/lib/auth";
import { Cell, CellMember, Member } from "@/lib/models";
import { filterOwnedMemberIds } from "@/lib/tenant";

// Toda consulta daqui recebe a `transaction` de quem chama: estas funções rodam
// DENTRO da transação de outras rotas (o service de membros, as rotas de
// célula). Uma consulta sem ela enxergaria outro snapshot e poderia travar
// contra a própria transação que a chamou.

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
  await CellMember.destroy({ where: { memberId, organizationId: organizationId(auth) }, transaction });
  if (!cellName || cellName === "Sem célula") return;

  const cell = await Cell.findOne({
    attributes: ["id"],
    where: { name: cellName, organizationId: organizationId(auth) },
    transaction,
    raw: true,
  });
  if (!cell) return;

  const [owned] = await filterOwnedMemberIds([memberId], organizationId(auth), transaction);
  if (!owned) return;

  // `ignoreDuplicates` é o ON CONFLICT DO NOTHING. `joined_at` fica de fora e
  // cai no DEFAULT do banco -- ver o comentário do Model `CellMember`.
  await CellMember.bulkCreate(
    [{ cellId: cell.id, memberId, organizationId: organizationId(auth) }],
    { ignoreDuplicates: true, returning: false, transaction },
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
    await CellMember.destroy({ where: { memberId, organizationId: organizationId(auth) }, transaction });
    await CellMember.bulkCreate(
      [{ cellId, memberId, organizationId: organizationId(auth) }],
      { ignoreDuplicates: true, returning: false, transaction },
    );
    await Member.update(
      { cellName },
      { where: { personId: memberId, organizationId: organizationId(auth) }, transaction },
    );
  }
}
