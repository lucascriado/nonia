import { query } from "@/lib/db";
import { organizationId, requirePermission } from "@/lib/auth";
import { paginacao } from "@/lib/listings";
import { apiError } from "@/lib/records";
import * as conn from "@/lib/whatsapp/connection";
import * as inbox from "@/lib/whatsapp/inbox";

export const runtime = "nodejs";

/**
 * A caixa de entrada desta igreja.
 *
 * A leitura é o que traz: consultar sincroniza a lista de conversas e empurra
 * algumas ainda não sincronizadas. O projeto não tem tarefa agendada, por
 * decisão registrada -- é o mesmo padrão do plano efetivo e do envio em massa.
 */
export async function GET(request: Request) {
  try {
    const auth = await requirePermission("whatsapp.read");
    const org = organizationId(auth);
    const { searchParams } = new URL(request.url);
    const { page, pageSize, offset } = paginacao(searchParams);

    const conexao = await conn.carregarConexao(org);
    if (!conexao) {
      return Response.json({
        records: [], total: 0, page, pageSize,
        sync: { state: "never_synced", chatsConhecidos: 0, chatsSincronizados: 0, lastSyncAt: null },
        connected: false,
      });
    }

    // Melhor esforço: o OpenWA fora do ar não pode impedir a igreja de VER o
    // que já foi trazido.
    let respondendo = true;
    try {
      await inbox.sincronizarConversas(conexao);
      await inbox.avancarSincronizacao(conexao);
      // Sem isto a caixa inteira aparece como "não identificado": esta conta
      // devolve TODAS as conversas como @lid, e @lid não carrega telefone.
      // Avança por leitura e com teto, como o resto -- é uma requisição ao
      // WhatsApp por conversa.
      await inbox.resolverTelefonesPendentes(conexao);
    } catch {
      respondendo = false;
    }

    const busca = searchParams.get("search")?.trim();
    const where = ["c.organization_id = $1"];
    const valores: unknown[] = [org];
    if (busca) {
      valores.push(`%${busca}%`);
      where.push(`concat_ws(' ', c.wa_name, c.phone, p.full_name) ILIKE $${valores.length}`);
    }
    if (searchParams.get("unread") === "true") where.push("c.unread_count > 0");
    const filtro = where.join(" AND ");

    const contagem = await query<{ total: number }>(
      `SELECT count(*)::int AS total FROM whatsapp_conversations c
         LEFT JOIN people p ON p.id = c.person_id
        WHERE ${filtro}`,
      valores,
    );
    const { rows } = await query(
      `SELECT c.id, c.chat_id AS "chatId", c.kind, c.phone,
              -- Se a pessoa está cadastrada, o nome DELA ganha do nome do
              -- WhatsApp: a igreja conhece a pessoa pelo cadastro.
              COALESCE(p.full_name, c.wa_name) AS name,
              c.person_id AS "personId",
              p.full_name IS NULL AS "naoIdentificado",
              c.last_message_at AS "lastMessageAt",
              c.last_message_preview AS "previewCru",
              -- A ÚLTIMA MENSAGEM DE VERDADE, para a prévia da lista sair da
              -- mesma função que a de dentro da conversa. Ver abaixo.
              u.type AS "ultimoTipo", u.body AS "ultimoCorpo",
              c.unread_count AS "unreadCount",
              c.sync_cursor IS NOT NULL AS "synced"
         FROM whatsapp_conversations c
         LEFT JOIN people p ON p.id = c.person_id
         LEFT JOIN LATERAL (
           SELECT m.type, m.body FROM whatsapp_messages m
            WHERE m.conversation_id = c.id AND m.organization_id = c.organization_id
              -- O mesmo corte da conversa: a prévia da lista tem que ser a
              -- última mensagem DE GENTE, senão a conversa aparece como
              -- "[aviso do WhatsApp]" enquanto a última fala foi um texto.
              AND m.type <> 'system'
            ORDER BY m.sent_at DESC, m.id DESC
            LIMIT 1
         ) u ON true
        WHERE ${filtro}
        ORDER BY c.last_message_at DESC NULLS LAST
        LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, pageSize, offset],
    );

    return Response.json({
      /**
       * A PRÉVIA DA LISTA SAI DA MESMA FUNÇÃO QUE A DE DENTRO DA CONVERSA.
       *
       * Antes ela vinha do `lastMessage` cru do chat, e o resultado era a MESMA
       * mensagem com dois textos: em branco na lista e "[foto]" dentro da
       * conversa. Foi o frontend que mediu, e ele fez o certo em não inventar
       * uma tabela de tipos do lado dele -- a tradução é do servidor e já
       * existia aqui.
       *
       * O campo cru não serve por mais um motivo, medido na conta real em
       * 07/09/2026: um dos chats devolve `lastMessage` com **78.336 caracteres**
       * e tipo `unknown`. Derivando, aquilo vira "[mensagem não suportada]" em
       * vez de 300 caracteres de lixo truncado.
       *
       * `null` quando não há mensagem sincronizada E o texto cru é vazio, e é
       * honesto: quer dizer "ainda não sabemos", não "a mensagem é vazia". Quem
       * lê tem o `synced` ao lado para distinguir os dois.
       */
      records: rows.map((c) => {
        const linha = c as Record<string, unknown> & {
          ultimoTipo: string | null; ultimoCorpo: string | null; previewCru: string | null;
        };
        const { ultimoTipo, ultimoCorpo, previewCru, ...resto } = linha;
        return {
          ...resto,
          preview: ultimoTipo ? inbox.previa(ultimoTipo, ultimoCorpo) : previewCru || null,
        };
      }),
      total: contagem.rows[0].total,
      page,
      pageSize,
      // O bloco que impede o vazio mentiroso: a tela só mostra "não há conversa"
      // com state === "idle" && total === 0.
      sync: await inbox.estadoSync(org),
      // DERIVADO de ter conseguido listar, não da coluna `status` gravada. A
      // coluna é atualizada pelas rotas de conexão; quem entra direto na caixa
      // depois de parear veria o valor velho e a tela diria "desconectado" para
      // uma igreja conectada. E listar conversas só funciona com a sessão
      // pronta -- o OpenWA responde 409 caso contrário --, então o sucesso da
      // listagem É a prova, e não um segundo palpite sobre ela.
      connected: respondendo ? true : conn.conectado(conexao.status),
    });
  } catch (error) {
    return apiError(error);
  }
}
