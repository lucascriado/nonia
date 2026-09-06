// Revogar um convite pendente.
//
// Namespace PRÓPRIO, e não /api/users/<id>, de propósito: convite e usuário
// são coisas diferentes com ids diferentes, e foi justamente confundir os dois
// que fez a falta desta rota aparecer. Manter separado é o que impede alguém
// mandar um id de convite para a rota de usuário e receber 404 sem entender.
//
// POR QUE ISTO IMPORTA MAIS DO QUE PARECE: convite pendente OCUPA ASSENTO do
// plano. Sem esta rota, um e-mail digitado errado consumia um assento para
// sempre -- numa igreja no Comunidade, três enganos custariam 30% do que ela
// paga.
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { conflict, notFound, requireUuid } from "@/lib/http";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("users.write");
    const { id } = await context.params;
    requireUuid(id, "Convite não encontrado.");

    const rows = await db.query<{ status: string; email: string }>(
      `SELECT status, email FROM invitations WHERE id = $1 AND organization_id = $2`,
      { bind: [id, organizationId(auth)], type: QueryTypes.SELECT },
    );
    const convite = rows[0];
    if (!convite) throw notFound("Convite não encontrado.");

    // Já revogado: o objetivo de quem chamou está cumprido, então responde
    // como sucesso em vez de erro. Dois cliques no mesmo botão não podem
    // virar mensagem de falha.
    if (convite.status === "revoked") return Response.json({ ok: true, email: convite.email });

    if (convite.status !== "pending") {
      throw conflict(
        convite.status === "accepted"
          ? "Este convite já foi aceito. Para tirar o acesso, remova o usuário na lista de usuários."
          : "Este convite não está mais pendente.",
        "invitation_not_pending",
      );
    }

    await db.transaction(async (transaction) => {
      await db.query(
        `UPDATE invitations SET status = 'revoked' WHERE id = $1 AND organization_id = $2`,
        { bind: [id, organizationId(auth)], transaction },
      );
      await addActivity(transaction, auth, "system", "cancelou o convite de", convite.email);
    });

    return Response.json({ ok: true, email: convite.email });
  } catch (error) {
    return apiError(error);
  }
}
