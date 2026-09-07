import { query } from "@/lib/db";
import { organizationId, requirePermission } from "@/lib/auth";
import { notFound, requireUuid } from "@/lib/http";
import { apiError } from "@/lib/records";
import * as conn from "@/lib/whatsapp/connection";
import * as envio from "@/lib/whatsapp/broadcast";

export const runtime = "nodejs";

type Cabecalho = {
  id: string; message: string; audience: string; status: string; total: number;
  startedAt: string | null; finishedAt: string | null; createdAt: string;
};

async function carregar(id: string, org: string) {
  const { rows } = await query<Cabecalho>(
    `SELECT id, message, audience, status, total,
            started_at AS "startedAt", finished_at AS "finishedAt", created_at AS "createdAt"
       FROM whatsapp_broadcasts WHERE id = $1 AND organization_id = $2`,
    [id, org],
  );
  // 404 e não 403: confirmar que o id existe em outra igreja já seria contar
  // algo sobre ela. Mesma regra do resto das rotas por id.
  if (!rows[0]) throw notFound("Envio não encontrado.");
  return rows[0];
}

/**
 * O acompanhamento -- e é ele quem EMPURRA o envio.
 *
 * O nonia não tem tarefa agendada, por decisão registrada, então quem avança o
 * envio é quem olha para ele. Ler aqui fecha o lote terminado e começa o
 * próximo, do mesmo jeito que o plano efetivo e o nível de acesso são
 * derivados na leitura em vez de gravados por um job.
 *
 * O que isso custa, dito e não escondido: um envio de 500 pessoas são 5 lotes.
 * Com a tela aberta ele anda sozinho; com a tela fechada ele PAUSA na virada de
 * lote e retoma quando alguém abrir. Não perde ninguém e não manda duas vezes,
 * porque cada destinatário só sai de `pending` uma vez.
 */
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("whatsapp.read");
    const { id } = await context.params;
    requireUuid(id, "Envio não encontrado.");
    const org = organizationId(auth);
    await carregar(id, org);

    // Avançar é melhor esforço: o OpenWA fora do ar não pode impedir a igreja
    // de VER o que já aconteceu.
    try {
      const conexao = await conn.exigirConexao(org);
      await envio.avancar(conexao, id, org);
    } catch {
      /* segue e mostra o estado gravado */
    }

    const cabecalho = await carregar(id, org);
    const { rows: destinatarios } = await query(
      `SELECT id, person_id AS "personId", name, phone, status,
              error_code AS "errorCode", error_message AS "errorMessage", sent_at AS "sentAt"
         FROM whatsapp_broadcast_recipients
        WHERE broadcast_id = $1 AND organization_id = $2
        -- Falha primeiro: é a única parte da lista sobre a qual há o que fazer.
        ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'skipped' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, name`,
      [id, org],
    );

    // As contagens saem das LINHAS, não de coluna gravada antes -- ver o
    // comentário na migration 013.
    const contagens = await envio.contagens(id);
    return Response.json({
      ...cabecalho,
      ...contagens,
      estimativaSegundos: envio.estimativaSegundos(contagens.pendingCount),
      recipients: destinatarios,
    });
  } catch (error) {
    return apiError(error);
  }
}

/** Interrompe o que ainda não saiu. O que já saiu, saiu -- e a tela diz isso. */
export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("whatsapp.broadcast");
    const { id } = await context.params;
    requireUuid(id, "Envio não encontrado.");
    const org = organizationId(auth);
    const cabecalho = await carregar(id, org);
    if (cabecalho.status === "done" || cabecalho.status === "canceled") {
      return Response.json({ ok: true, status: cabecalho.status });
    }

    await query(
      `UPDATE whatsapp_broadcasts SET status = 'canceled', finished_at = now(), updated_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [id, org],
    );
    // Só o que ainda não foi despachado. Cancelar não desfaz mensagem enviada:
    // não existe desfazer no WhatsApp, e a tela não vai fingir que existe.
    await query(
      `UPDATE whatsapp_broadcast_recipients SET status = 'skipped'
        WHERE broadcast_id = $1 AND status = 'pending' AND wa_batch_id IS NULL`,
      [id],
    );
    return Response.json({ ok: true, status: "canceled" });
  } catch (error) {
    return apiError(error);
  }
}
