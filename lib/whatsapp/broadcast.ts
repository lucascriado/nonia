import { query } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { filtrosDeMembros, filtrosDeVisitantes } from "@/lib/listings";
import * as openwa from "./openwa";
import { Conexao } from "./connection";

/**
 * Envio em massa.
 *
 * TETO DE 500 PESSOAS POR ENVIO, expresso em PESSOAS e não em bytes nem em
 * tempo -- mesmo critério do teto de 500 comprovantes: limite que se entende
 * ganha de promessa que às vezes quebra.
 *
 * E o teto tem uma consequência que a tela PRECISA dizer antes de confirmar:
 * com ~4 s por mensagem, 500 pessoas são mais de meia hora. Por isso
 * `estimativa()` existe e o preview a devolve. "500 pessoas" sozinho é
 * armadilha; "500 pessoas, cerca de 35 minutos" é informação.
 */
export const TETO_POR_ENVIO = 500;

/** Duração estimada, em segundos. O jitter médio entra porque ele é metade do intervalo. */
export const estimativaSegundos = (destinatarios: number) =>
  Math.round((destinatarios * (openwa.INTERVALO_MS + openwa.JITTER_MEDIO_MS)) / 1000);

/**
 * Telefone do cadastro -> chatId do WhatsApp.
 *
 * Devolve `null` em vez de lançar: número faltando ou impossível é CASO NORMAL,
 * não erro. Metade de um cadastro de igreja pode não ter telefone, e isso vira
 * "não recebe" na conferência de antes do envio, nunca uma falha depois.
 */
export function chatIdDoTelefone(telefone: string | null | undefined): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  // 10 (fixo com DDD) ou 11 (celular com DDD) -> falta o país, e aqui é 55.
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}@c.us`;
  // Já com país: 12 ou 13 dígitos começando em 55.
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return `${digitos}@c.us`;
  // Estrangeiro plausível. Não inventamos país para número que não reconhecemos.
  if (digitos.length >= 11 && digitos.length <= 15) return `${digitos}@c.us`;
  return null;
}

export type Publico = "members" | "visitors";

export type Candidato = { id: string; name: string; phone: string | null; chatId: string | null };

/**
 * Quem seria alcançado pelo filtro que a pessoa está vendo.
 *
 * Sai do MESMO `lib/listings.ts` da listagem e da exportação. Não é economia de
 * código: é o que faz "mandar para quem estou vendo" ser estrutural em vez de
 * depender de alguém manter dois WHERE espelhados.
 */
export async function candidatos(publico: Publico, params: URLSearchParams, organizationId: string): Promise<Candidato[]> {
  const filtro = publico === "members"
    ? filtrosDeMembros(params, organizationId)
    : filtrosDeVisitantes(params, organizationId);
  const view = publico === "members" ? "member_directory" : "visitor_directory";
  const { rows } = await query<{ id: string; name: string; phone: string | null }>(
    `SELECT id, full_name AS name, phone FROM ${view}
      WHERE ${filtro.where.join(" AND ")}
      ORDER BY full_name
      LIMIT ${TETO_POR_ENVIO + 1}`,
    filtro.valores,
  );
  return rows.map((r) => ({ ...r, chatId: chatIdDoTelefone(r.phone) }));
}

export type Conferencia = {
  total: number;
  comTelefone: number;
  semTelefone: number;
  acimaDoTeto: boolean;
  teto: number;
  estimativaSegundos: number;
};

/** A conferência de ANTES. Ausência informada antes vale mais que falha depois. */
export function conferir(lista: Candidato[]): Conferencia {
  const dentro = lista.slice(0, TETO_POR_ENVIO);
  const comTelefone = dentro.filter((c) => c.chatId).length;
  return {
    total: dentro.length,
    comTelefone,
    semTelefone: dentro.length - comTelefone,
    acimaDoTeto: lista.length > TETO_POR_ENVIO,
    teto: TETO_POR_ENVIO,
    estimativaSegundos: estimativaSegundos(comTelefone),
  };
}

// --- execução ---------------------------------------------------------------

type LinhaDestinatario = {
  id: string;
  person_id: string | null;
  name: string;
  phone: string | null;
  status: string;
  wa_batch_id: string | null;
};

/**
 * Empurra o envio um lote adiante, e é chamada NA LEITURA.
 *
 * O nonia não tem tarefa agendada -- decisão registrada, e o mesmo motivo de
 * plano efetivo e nível de acesso serem derivados na leitura. Então quem avança
 * o envio é quem olha para ele: a tela de acompanhamento consulta, e a consulta
 * fecha o lote terminado e começa o próximo.
 *
 * CONSEQUÊNCIA QUE PRECISA ESTAR DITA, e não escondida: um envio de 500 pessoas
 * são 5 lotes, e ele avança de lote quando alguém consulta. Com a tela aberta,
 * anda sozinho. Com a tela fechada, ele PAUSA na virada do lote e retoma quando
 * alguém abrir de novo -- não perde nada e não manda duas vezes, porque cada
 * destinatário tem status próprio e só sai de `pending` uma vez.
 */
export async function avancar(conexao: Conexao, broadcastId: string, organizationId: string) {
  const { rows: envios } = await query<{ id: string; message: string; status: string }>(
    `SELECT id, message, status FROM whatsapp_broadcasts WHERE id = $1 AND organization_id = $2`,
    [broadcastId, organizationId],
  );
  const envio = envios[0];
  if (!envio) return;
  if (envio.status === "done" || envio.status === "canceled" || envio.status === "failed") return;

  // 1. Reconciliar o que já foi despachado: a ENTREGA é do OpenWA, e a linha
  //    daqui é cópia da resposta dele.
  const { rows: emVoo } = await query<{ wa_batch_id: string }>(
    `SELECT DISTINCT wa_batch_id FROM whatsapp_broadcast_recipients
      WHERE broadcast_id = $1 AND status = 'pending' AND wa_batch_id IS NOT NULL`,
    [broadcastId],
  );
  for (const { wa_batch_id } of emVoo) {
    await reconciliar(conexao, broadcastId, wa_batch_id);
  }

  // 2. Se não sobrou nada em voo, despachar o próximo lote.
  const { rows: pendentes } = await query<LinhaDestinatario>(
    `SELECT id, person_id, name, phone, status, wa_batch_id
       FROM whatsapp_broadcast_recipients
      WHERE broadcast_id = $1 AND status = 'pending' AND wa_batch_id IS NULL
      ORDER BY created_at, id
      LIMIT ${openwa.LOTE_MAX}`,
    [broadcastId],
  );

  const aindaEmVoo = (
    await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM whatsapp_broadcast_recipients
        WHERE broadcast_id = $1 AND status = 'pending' AND wa_batch_id IS NOT NULL`,
      [broadcastId],
    )
  ).rows[0].n;

  if (aindaEmVoo === 0 && pendentes.length > 0) {
    // O despacho tem try próprio: o OpenWA fora do ar não pode impedir o
    // fechamento nem a leitura de refletirem o que já está gravado.
    try {
    const itens: openwa.ItemDoLote[] = [];
    const ids: string[] = [];
    const chats: string[] = [];
    for (const p of pendentes) {
      const chatId = chatIdDoTelefone(p.phone);
      if (!chatId) continue;
      itens.push({ chatId, type: "text", content: { text: envio.message } });
      ids.push(p.id);
      chats.push(chatId);
    }
    if (itens.length) {
      const lote = await openwa.enviarLote(conexao.sessionId, conexao.apiKey, itens);
      // Grava o chatId junto do lote: é por ele que a resposta volta a encontrar
      // esta linha, sem heurística.
      await query(
        `UPDATE whatsapp_broadcast_recipients AS r
            SET wa_batch_id = $1, chat_id = d.chat_id
           FROM unnest($2::uuid[], $3::text[]) AS d(id, chat_id)
          WHERE r.id = d.id`,
        [lote.batchId, ids, chats],
      );
      await query(
        `UPDATE whatsapp_broadcasts SET status = 'running',
                started_at = COALESCE(started_at, now()), updated_at = now()
          WHERE id = $1`,
        [broadcastId],
      );
      }
    } catch (erro) {
      await fecharSeTerminou(broadcastId);
      throw erro;
    }
  }

  await fecharSeTerminou(broadcastId);
}

async function reconciliar(conexao: Conexao, broadcastId: string, batchId: string) {
  const lote = await openwa.lerLote(conexao.sessionId, conexao.apiKey, batchId).catch(() => null);
  if (!lote?.results?.length) return;

  for (const r of lote.results) {
    if (!r.chatId) continue;
    const entregue = Boolean(r.messageId) && !r.error;
    await query(
      `UPDATE whatsapp_broadcast_recipients
          SET status = $4, wa_message_id = $5, error_code = $6, error_message = $7, sent_at = $8
        WHERE broadcast_id = $1 AND wa_batch_id = $2 AND chat_id = $3 AND status = 'pending'`,
      [
        broadcastId,
        batchId,
        r.chatId,
        entregue ? "sent" : "failed",
        r.messageId ?? null,
        r.error?.code ?? null,
        (r.error?.message ?? null)?.slice(0, 300) ?? null,
        r.sentAt ?? (entregue ? new Date().toISOString() : null),
      ],
    );
  }
}

/**
 * Fecha o envio quando não sobrou ninguém pendente.
 *
 * Só isto: as CONTAGENS não são gravadas, são contadas na leitura por
 * `contagens()`. Gravá-las custou um defeito que o teste pegou -- com o
 * despacho falhando, o contador não rodava e a tela dizia "0 pulados" com três
 * pulados na tabela.
 */
async function fecharSeTerminou(broadcastId: string) {
  await query(
    `UPDATE whatsapp_broadcasts b
        SET status = 'done', finished_at = COALESCE(b.finished_at, now()), updated_at = now()
      WHERE b.id = $1
        AND b.status NOT IN ('canceled', 'done', 'failed')
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_broadcast_recipients r
           WHERE r.broadcast_id = b.id AND r.status = 'pending'
        )`,
    [broadcastId],
  );
}

export type Contagens = { sentCount: number; failedCount: number; skippedCount: number; pendingCount: number };

/** As contagens saem SEMPRE das linhas, nunca de coluna gravada antes. */
export async function contagens(broadcastId: string): Promise<Contagens> {
  const { rows } = await query<Contagens>(
    `SELECT count(*) FILTER (WHERE status = 'sent')::int    AS "sentCount",
            count(*) FILTER (WHERE status = 'failed')::int  AS "failedCount",
            count(*) FILTER (WHERE status = 'skipped')::int AS "skippedCount",
            count(*) FILTER (WHERE status = 'pending')::int AS "pendingCount"
       FROM whatsapp_broadcast_recipients WHERE broadcast_id = $1`,
    [broadcastId],
  );
  return rows[0] ?? { sentCount: 0, failedCount: 0, skippedCount: 0, pendingCount: 0 };
}

export function exigirMensagem(texto: unknown): string {
  const t = typeof texto === "string" ? texto.trim() : "";
  if (!t) throw badRequest("Escreva a mensagem antes de enviar.", "message_required");
  if (t.length > 4096) throw badRequest("A mensagem passa de 4096 caracteres, que é o limite do WhatsApp.", "message_too_long");
  return t;
}
