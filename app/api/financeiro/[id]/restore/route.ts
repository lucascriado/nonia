// Restaurar um lançamento da lixeira.
//
// É a metade que faz a exclusão lógica valer alguma coisa: sem caminho de
// volta pelo produto, "lixeira" seria só uma coluna que ninguém alcança, e o
// dado estaria igualmente perdido para quem usa.
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { notFound, requireUuid } from "@/lib/http";
import { FinancialTransaction } from "@/lib/models";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("finance.write");
    const { id } = await context.params;
    requireUuid(id, "Lançamento não encontrado na lixeira.");

    await db.transaction(async (transaction) => {
      const record = await FinancialTransaction.findOne({
        where: { id, organizationId: organizationId(auth) },
        transaction,
      });
      // Não encontrado e "não está na lixeira" são a mesma resposta: nos dois
      // casos não há o que restaurar.
      if (!record || record.deletedAt === null) {
        throw notFound("Lançamento não encontrado na lixeira.");
      }

      await FinancialTransaction.update(
        { deletedAt: null, deletedBy: null },
        { where: { id, organizationId: organizationId(auth) }, transaction },
      );
      // O histórico já registrava quem excluiu; agora registra quem trouxe de
      // volta, senão a lixeira vira um caminho sem rastro.
      await addActivity(transaction, auth, "financial", "restaurou o lançamento", record.description);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
