import { query } from "@/lib/db";
import { organizationId, requirePermission } from "@/lib/auth";
import { notFound, requireUuid } from "@/lib/http";
import { apiError } from "@/lib/records";
import * as conn from "@/lib/whatsapp/connection";
import * as openwa from "@/lib/whatsapp/openwa";

export const runtime = "nodejs";

/**
 * BAIXA a mídia de uma mensagem recebida.
 *
 * Esta rota existe por uma razão só, e ela é de segurança: o navegador precisa
 * dos bytes, e a chave do OpenWA **não pode ir junto**. Uma `<img src>` apontando
 * direto para o OpenWA obrigaria a chave da igreja a viver no HTML -- e essa
 * chave envia mensagem em nome dela. Aqui o navegador chega com o cookie de
 * sessão do nonia, e a chave nunca sai do servidor.
 *
 * A mídia NÃO é copiada para o nosso banco, nem em cache: base64 em tabela foi
 * o que fez as listagens chegarem a 43 MB, e uma foto tem o tamanho de uma
 * listagem inteira. O dono do arquivo continua sendo o WhatsApp.
 *
 * 404 AQUI É CASO NORMAL. O gateway só guarda os bytes do que viu ao vivo, e o
 * histórico trazido no pareamento vem só com texto -- então foto de conversa
 * antiga responde 404 para sempre. A tela mostra "[foto]" com aviso de mídia
 * fora de alcance; não é erro, e tratar como erro faria a igreja procurar
 * defeito onde não há.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const auth = await requirePermission("whatsapp.read");
    const { id, messageId } = await context.params;
    requireUuid(id, "Conversa não encontrada.");
    const org = organizationId(auth);

    // O par (conversa, mensagem) é conferido no NOSSO banco antes de qualquer
    // chamada: sem isso, um id de mensagem de outra igreja seria repassado ao
    // OpenWA, que só sabe de sessões, não de organizações.
    const { rows } = await query<{ chat_id: string }>(
      `SELECT c.chat_id FROM whatsapp_messages m
         JOIN whatsapp_conversations c
           ON c.id = m.conversation_id AND c.organization_id = m.organization_id
        WHERE m.organization_id = $1 AND m.conversation_id = $2 AND m.wa_message_id = $3`,
      [org, id, messageId],
    );
    if (!rows[0]) throw notFound("Mensagem não encontrada nesta conversa.");

    const conexao = await conn.exigirConexao(org);
    const midia = await openwa.baixarMidia(conexao.sessionId, conexao.apiKey, rows[0].chat_id, messageId);

    return new Response(midia.bytes, {
      headers: {
        "content-type": midia.mimetype,
        // `inline` para a foto aparecer no balão em vez de baixar. O OpenWA
        // serve `attachment` e já reduz o mimetype a um conjunto inerte; o
        // `nosniff` continua aqui porque é ele que impede o navegador de
        // adivinhar tipo e renderizar como conteúdo ativo.
        "content-disposition": midia.filename
          ? `inline; filename*=UTF-8''${encodeURIComponent(midia.filename)}`
          : "inline",
        "x-content-type-options": "nosniff",
        // Privado e curto: é conteúdo de uma igreja, não pode ficar em cache
        // compartilhado, e o navegador reaproveitar por alguns minutos evita
        // rebaixar a mesma foto a cada rolagem.
        "cache-control": "private, max-age=300",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
