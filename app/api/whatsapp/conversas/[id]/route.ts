import { query } from "@/lib/db";
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
      `SELECT m.id, m.wa_message_id AS "waMessageId", m.from_me AS "fromMe",
              m.author, m.author_name AS "authorName",
              m.type, m.body, m.sent_at AS "sentAt",
              m.media_mimetype AS "mediaMimetype", m.media_filename AS "mediaFilename",
              m.quoted_wa_message_id AS "quotedWaMessageId",
              -- A prévia da CITADA sai da própria tabela, e não de uma cópia
              -- guardada na linha de quem cita: cópia divergiria no dia em que a
              -- original fosse editada ou apagada.
              q.type AS "quotedType", q.body AS "quotedBody"
         FROM whatsapp_messages m
         LEFT JOIN whatsapp_messages q
                ON q.organization_id = m.organization_id
               AND q.wa_message_id = m.quoted_wa_message_id
        WHERE m.conversation_id = $1 AND m.organization_id = $2
          -- Aviso do WhatsApp não é mensagem de gente. Ver tipoParaGuardar().
          AND m.type <> 'system'
        ORDER BY m.sent_at, m.id`,
      [id, org],
    );

    // CONTADOS, e não sumidos em silêncio: numa conversa medida na conta real,
    // 155 das 155 linhas eram avisos. Sem este número, a tela mostraria uma
    // conversa vazia para um chat que o Lucas vê cheio no celular -- que é o
    // vazio que mente, com outra roupa.
    const { rows: avisos } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM whatsapp_messages
        WHERE conversation_id = $1 AND organization_id = $2 AND type = 'system'`,
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
      avisosIgnorados: avisos[0].n,
      // A prévia vem calculada daqui, e não da tela: mídia vira marcador de
      // texto ("[foto]") em vez de linha vazia, e o cálculo mora num lugar só.
      messages: rows.map((m) => {
        const linha = m as {
          id: string; fromMe: boolean; sentAt: string;
          author: string | null; authorName: string | null;
          waMessageId: string; type: string; body: string | null;
          mediaMimetype: string | null; mediaFilename: string | null;
          quotedWaMessageId: string | null; quotedType: string | null; quotedBody: string | null;
        };
        // DERIVADO do tipo, nunca lido de coluna: a `has_media` da 015 gravava
        // false para toda mensagem (o histórico é pedido sem mídia de
        // propósito), e quem lesse acreditaria. Ver a 016.
        const kind = inbox.midiaDoTipo(linha.type);
        // MONTADO CAMPO A CAMPO, e não com `...linha`, de propósito: o spread
        // levava junto as colunas cruas do JOIN (`mediaMimetype`,
        // `quotedWaMessageId`, `quotedType`, `quotedBody`), então a resposta
        // carregava os MESMOS dados com dois nomes. Duas versões do mesmo campo
        // é como um contrato deixa de ser contrato: quem lê não sabe qual das
        // duas vale, e as duas passam a ter que ser mantidas.
        return {
          id: linha.id,
          waMessageId: linha.waMessageId,
          fromMe: linha.fromMe,
          author: linha.author,
          authorName: linha.authorName,
          type: linha.type,
          body: linha.body,
          sentAt: linha.sentAt,
          preview: inbox.previa(linha.type, linha.body),
          hasMedia: kind !== null,
          media: kind
            ? {
                // A URL é do NONIA, não do OpenWA: o navegador chega nela com o
                // cookie de sessão normal e a chave do OpenWA nunca sai daqui.
                url: `/api/whatsapp/conversas/${id}/midia/${encodeURIComponent(linha.waMessageId)}`,
                mimetype: linha.mediaMimetype,
                filename: linha.mediaFilename,
                kind,
              }
            : null,
          quoted: linha.quotedWaMessageId
            ? {
                waMessageId: linha.quotedWaMessageId,
                // Citada que ainda não foi sincronizada não vira null nem some:
                // o balão diz que há uma citação e que o texto dela não veio.
                preview: linha.quotedType
                  ? inbox.previa(linha.quotedType, linha.quotedBody)
                  : "[mensagem fora do trecho carregado]",
              }
            : null,
        };
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
    const payload = await readJson<{ message?: string; quotedWaMessageId?: string }>(request);
    const texto = inbox.exigirTexto(payload.message);
    // A citada tem que ser DESTA conversa. Sem essa checagem, um id de outra
    // conversa (ou de outra igreja) iria direto para o WhatsApp, e o vazamento
    // seria por citação -- a mensagem citada aparece dentro do balão enviado.
    const citada = await inbox.exigirCitadaDaConversa(id, org, payload.quotedWaMessageId);

    // Teto de sanidade: pega automação, não gente. Ver lib/whatsapp/inbox.ts.
    await inbox.assertPodeResponder(org);

    const conexao = await conn.exigirConexao(org);
    const enviada = await openwa.enviarTexto(conexao.sessionId, conexao.apiKey, conversa.chat_id, texto, citada);
    const waId = enviada.messageId ?? enviada.id ?? `local-${Date.now()}`;

    await inbox.registrarEnviada(
      auth,
      { id, organizationId: org, nome: conversa.wa_name ?? conversa.phone },
      { waMessageId: waId, type: "text", body: texto, quotedWaMessageId: citada },
      citada ? "respondeu citando no WhatsApp" : "respondeu no WhatsApp",
    );

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
