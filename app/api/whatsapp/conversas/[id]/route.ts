import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { notFound, readJson, requireUuid } from "@/lib/http";
import { apiError } from "@/lib/records";
import { assertBelongsToOrganization } from "@/lib/tenant";
import * as conn from "@/lib/whatsapp/connection";
import * as inbox from "@/lib/whatsapp/inbox";
import * as openwa from "@/lib/whatsapp/openwa";

export const runtime = "nodejs";

type Conversa = {
  id: string; chat_id: string; kind: string; phone: string | null;
  person_id: string | null; wa_name: string | null; sync_cursor: string | null;
};

async function carregar(id: string, org: string): Promise<Conversa> {
  const { rows } = await query<Conversa>(
    `SELECT id, chat_id, kind, phone, person_id, wa_name, sync_cursor
       FROM whatsapp_conversations WHERE id = $1 AND organization_id = $2`,
    [id, org],
  );
  // 404 e não 403: confirmar que o id existe já contaria algo sobre a outra igreja.
  if (!rows[0]) throw notFound("Conversa não encontrada.");
  return rows[0];
}

/** A conversa e as mensagens dela. Abrir é o que sincroniza. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("whatsapp.read");
    const { id } = await context.params;
    requireUuid(id, "Conversa não encontrada.");
    const org = organizationId(auth);
    const conversa = await carregar(id, org);

    // "Trazer mais" é SOB DEMANDA e nunca automático: acima de 100 a rota do
    // OpenWA exige `deep`, que ela mesma avisa aumentar o risco de o WhatsApp
    // limitar a conta. Puxar fundo sozinho, a cada abertura, gastaria esse
    // risco sem ninguém ter pedido.
    const fundo = new URL(request.url).searchParams.get("deep") === "true";

    let sincronizou = true;
    try {
      const conexao = await conn.exigirConexao(org);
      await inbox.sincronizarMensagens(
        conexao, conversa.id, conversa.chat_id, conversa.sync_cursor, fundo ? 500 : undefined);
      await openwa.marcarLida(conexao.sessionId, conexao.apiKey, conversa.chat_id).catch(() => undefined);
      await query(`UPDATE whatsapp_conversations SET unread_count = 0 WHERE id = $1`, [id]);
    } catch {
      sincronizou = false;
    }

    const { rows } = await query(
      `SELECT m.id, m.wa_message_id AS "waMessageId", m.from_me AS "fromMe", m.author,
              m.type, m.body, m.has_media AS "hasMedia", m.sent_at AS "sentAt"
         FROM whatsapp_messages m
        WHERE m.conversation_id = $1 AND m.organization_id = $2
        ORDER BY m.sent_at, m.id`,
      [id, org],
    );

    const { rows: cab } = await query<Record<string, unknown>>(
      `SELECT c.id, c.chat_id AS "chatId", c.kind, c.phone, c.person_id AS "personId",
              COALESCE(p.full_name, c.wa_name) AS name,
              p.full_name IS NULL AS "naoIdentificado",
              c.sync_cursor IS NOT NULL AS "synced"
         FROM whatsapp_conversations c
         LEFT JOIN people p ON p.id = c.person_id
        WHERE c.id = $1 AND c.organization_id = $2`,
      [id, org],
    );

    // O topo da conversa NÃO pode parecer o começo dela quando não é.
    // Trouxemos as N mais recentes; se vieram N cheias, há mais atrás, e a tela
    // precisa dizer isso -- conversa que parece nascer do nada é irmã do vazio
    // que mente.
    const podeHaverMais = rows.length >= (fundo ? 500 : 100);

    return Response.json({
      ...cab[0],
      hasMore: podeHaverMais,
      deep: fundo,
      // A prévia vem calculada daqui, e não da tela: mídia vira marcador de
      // texto ("[foto]") em vez de linha vazia, e o cálculo mora num lugar só.
      messages: rows.map((m) => {
        const linha = m as { type: string; body: string | null };
        return { ...linha, preview: inbox.previa(linha.type, linha.body) };
      }),
      stale: !sincronizou,
    });
  } catch (error) {
    return apiError(error);
  }
}

/** RESPONDER. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("whatsapp.write");
    const { id } = await context.params;
    requireUuid(id, "Conversa não encontrada.");
    const org = organizationId(auth);
    const conversa = await carregar(id, org);
    const payload = await readJson<{ message?: string }>(request);
    const texto = inbox.exigirTexto(payload.message);

    // Teto de sanidade: pega automação, não gente. Ver lib/whatsapp/inbox.ts.
    await inbox.assertPodeResponder(org);

    const conexao = await conn.exigirConexao(org);
    const enviada = await openwa.enviarTexto(conexao.sessionId, conexao.apiKey, conversa.chat_id, texto);
    const waId = enviada.messageId ?? enviada.id ?? `local-${Date.now()}`;

    await db.transaction(async (transaction) => {
      await db.query(
        `INSERT INTO whatsapp_messages
           (conversation_id, organization_id, wa_message_id, from_me, type, body, sent_at)
         VALUES ($1, $2, $3, true, 'text', $4, now())
         ON CONFLICT (organization_id, wa_message_id) DO NOTHING`,
        { bind: [id, org, waId, texto], transaction },
      );
      await db.query(
        `UPDATE whatsapp_conversations
            SET last_message_at = now(), last_message_preview = $2, unread_count = 0, updated_at = now()
          WHERE id = $1`,
        { bind: [id, texto.slice(0, 300)], transaction },
      );
      await addActivity(transaction, auth, "whatsapp", "respondeu no WhatsApp", conversa.wa_name ?? conversa.phone);
    });

    return Response.json({ ok: true, waMessageId: waId }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

/** Vincular a conversa a uma pessoa do cadastro (ou desvincular com null). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("whatsapp.write");
    const { id } = await context.params;
    requireUuid(id, "Conversa não encontrada.");
    const org = organizationId(auth);
    await carregar(id, org);
    const payload = await readJson<{ personId?: string | null }>(request);

    if (payload.personId) {
      await assertBelongsToOrganization("people", "id", payload.personId, org);
    }
    await query(
      `UPDATE whatsapp_conversations SET person_id = $3, updated_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [id, org, payload.personId ?? null],
    );
    return Response.json({ ok: true, personId: payload.personId ?? null });
  } catch (error) {
    return apiError(error);
  }
}
