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
              c.last_message_preview AS "preview",
              c.unread_count AS "unreadCount",
              c.sync_cursor IS NOT NULL AS "synced"
         FROM whatsapp_conversations c
         LEFT JOIN people p ON p.id = c.person_id
        WHERE ${filtro}
        ORDER BY c.last_message_at DESC NULLS LAST
        LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, pageSize, offset],
    );

    return Response.json({
      records: rows,
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
