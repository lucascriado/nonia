import { query } from "@/lib/db";
import { HttpError, badRequest } from "@/lib/http";
import * as openwa from "./openwa";
import { Conexao } from "./connection";

/**
 * A caixa de entrada.
 *
 * NENHUMA JANELA DE TEMPO INVENTADA, e é decisão: a lista de conversas vem
 * INTEIRA no pareamento (o WhatsApp empurra o retrato completo ao conectar, com
 * `syncFullHistory` desligado), e a ordenação que importa é por última
 * atividade -- que é como a pessoa procura uma conversa. Um corte tipo "90
 * dias" só criaria "por que a conversa da tia Maria sumiu?" para ganhar nada.
 *
 * Em "Recentes" eu cortei em 14 dias porque O DADO PEDIA: a semente tinha a
 * fronteira embutida e o rótulo prometia um período. Aqui não pede.
 */

/**
 * Prévia de uma mensagem, calculada NO SERVIDOR.
 *
 * Mensagem de mídia não pode virar linha vazia -- quem olha acha que quebrou.
 * Então vira marcador de TEXTO entre colchetes, sem ícone e sem cor.
 *
 * Os 16 tipos que o OpenWA serve estão todos aqui, e não só os três óbvios:
 * tipo não mapeado voltaria a ser a linha vazia que isto existe para evitar.
 * Dois merecem atenção: `voice` não é `audio` (é nota de voz), e `revoked` é
 * mensagem apagada pelo outro lado -- mostrar o marcador é mais honesto que
 * sumir com a linha, porque sumir faz a conversa parecer ter buracos.
 */
const MARCADOR: Record<string, string> = {
  image: "[foto]",
  video: "[vídeo]",
  audio: "[áudio]",
  voice: "[mensagem de voz]",
  document: "[documento]",
  sticker: "[figurinha]",
  location: "[localização]",
  contact: "[contato]",
  poll: "[enquete]",
  call: "[chamada]",
  revoked: "[mensagem apagada]",
  order: "[pedido]",
  product: "[produto]",
  masked: "[mensagem protegida]",
  unknown: "[mensagem não suportada]",
};

export function previa(tipo: string, corpo: string | null | undefined): string {
  const texto = (corpo ?? "").trim();
  if (tipo === "text") return texto.slice(0, 300);
  const marca = MARCADOR[tipo] ?? MARCADOR.unknown;
  // Foto COM legenda mostra as duas coisas: a legenda é conteúdo de verdade.
  return (texto ? `${marca} ${texto}` : marca).slice(0, 300);
}

/** Telefone a partir do chatId (`5511999999999@c.us`). Grupo e @lid não têm. */
export function telefoneDoChat(chatId: string): string | null {
  const [numero, dominio] = chatId.split("@");
  if (dominio !== "c.us" || !/^\d{10,15}$/.test(numero)) return null;
  return numero;
}

/**
 * Casa a conversa com uma pessoa do cadastro pelos últimos 8 dígitos.
 *
 * Oito e não o número inteiro porque o cadastro tem "(11) 98888-1111" e o
 * WhatsApp tem "5511988881111": comparar formatos diferentes não casaria nunca.
 * O sufixo é o que sobrevive a DDI, DDD e ao nono dígito.
 *
 * Ambíguo (dois cadastros terminando igual) devolve NULL de propósito: ligar a
 * conversa à pessoa errada é pior que deixá-la como não identificada, porque o
 * erro fica invisível -- alguém responderia achando que fala com outra pessoa.
 */
async function acharPessoa(organizationId: string, telefone: string | null): Promise<string | null> {
  if (!telefone || telefone.length < 8) return null;
  const sufixo = telefone.slice(-8);
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM people
      WHERE organization_id = $1
        AND phone IS NOT NULL
        AND right(regexp_replace(phone, '\\D', '', 'g'), 8) = $2
      LIMIT 2`,
    [organizationId, sufixo],
  );
  return rows.length === 1 ? rows[0].id : null;
}

/** Traz a LISTA de conversas. Uma requisição, e é ela que cumpre "carregou meus chats". */
export async function sincronizarConversas(conexao: Conexao) {
  const conversas = await openwa.listarConversas(conexao.sessionId, conexao.apiKey);
  for (const c of conversas) {
    const telefone = telefoneDoChat(c.id);
    const pessoa = await acharPessoa(conexao.organizationId, telefone);
    await query(
      `INSERT INTO whatsapp_conversations
         (organization_id, chat_id, kind, wa_name, phone, person_id,
          last_message_at, last_message_preview, unread_count)
       VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7), $8, $9)
       ON CONFLICT (organization_id, chat_id) DO UPDATE SET
         wa_name = EXCLUDED.wa_name,
         last_message_at = EXCLUDED.last_message_at,
         last_message_preview = EXCLUDED.last_message_preview,
         unread_count = EXCLUDED.unread_count,
         -- O vínculo com a pessoa NÃO é sobrescrito quando já existe: alguém
         -- pode tê-lo feito à mão, e uma sincronização não desfaz decisão de
         -- gente. Só preenche o que está vazio.
         person_id = COALESCE(whatsapp_conversations.person_id, EXCLUDED.person_id),
         kind = EXCLUDED.kind,
         phone = COALESCE(EXCLUDED.phone, whatsapp_conversations.phone),
         updated_at = now()`,
      [conexao.organizationId, c.id, c.isGroup ? "group" : (c.kind ?? "individual"),
       c.name ?? null, telefone, pessoa, c.timestamp || 0, (c.lastMessage ?? "").slice(0, 300) || null, c.unreadCount ?? 0],
    );
  }
  await query(
    `UPDATE organization_whatsapp SET chats_synced_at = now(), chats_known = $2, updated_at = now()
      WHERE organization_id = $1`,
    [conexao.organizationId, conversas.length],
  );
  return conversas.length;
}

/**
 * Traz o histórico de UMA conversa.
 *
 * CEM MENSAGENS, e é escolha de QUANTIDADE, não de tempo. Conversa de igreja
 * acontece em rajadas -- uma troca inteira de domingo passa fácil de 50 --, e
 * cortar no meio de uma conversa é pior que trazer um pouco a mais. 100 é
 * também o teto padrão da rota; acima disso ela exige `deep`, que vai até 2000
 * e traz aviso do próprio OpenWA sobre risco de limitação. Por isso o "trazer
 * mais" é sob demanda e não automático.
 *
 * Não há janela de TEMPO: nada some por idade.
 *
 * Reler não duplica: o par (organização, id da mensagem) é único no banco.
 */
export async function sincronizarMensagens(
  conexao: Conexao,
  conversaId: string,
  chatId: string,
  _cursor: string | null,
  limite = openwa.TETO_HISTORICO,
) {
  const mensagens = await openwa.lerHistorico(
    conexao.sessionId, conexao.apiKey, chatId, limite, limite > openwa.TETO_HISTORICO);
  let ultimo: string | null = null;
  for (const m of mensagens) {
    await query(
      `INSERT INTO whatsapp_messages
         (conversation_id, organization_id, wa_message_id, from_me, author, type, body, has_media, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9))
       -- Reler o mesmo trecho não duplica: o par (igreja, id da mensagem) é único.
       ON CONFLICT (organization_id, wa_message_id) DO NOTHING`,
      [conversaId, conexao.organizationId, m.id, Boolean(m.fromMe), m.author ?? null,
       m.type ?? "text", m.body ?? null, Boolean(m.media), m.timestamp || 0],
    );
    ultimo = m.id;
  }
  // O cursor aqui é MARCA DE "já foi buscada", não posição de keyset: esta rota
  // sempre devolve as N mais recentes. Guardar a última vista mantém a coluna
  // útil (dá para ver se mudou) sem prometer paginação que a rota não tem.
  await query(
    `UPDATE whatsapp_conversations SET sync_cursor = COALESCE($2, sync_cursor, $3), synced_at = now(), updated_at = now()
      WHERE id = $1`,
    [conversaId, ultimo, "vazia"],
  );
  return mensagens.length;
}

/**
 * Uma conversa ainda não sincronizada avança por leitura, mais recente
 * primeiro. Mesmo padrão do envio em massa e do plano efetivo: o projeto não
 * tem tarefa agendada, então quem avança é quem olha.
 */
export async function avancarSincronizacao(conexao: Conexao, quantas = 3) {
  const { rows } = await query<{ id: string; chat_id: string }>(
    `SELECT id, chat_id FROM whatsapp_conversations
      WHERE organization_id = $1 AND sync_cursor IS NULL
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT ${quantas}`,
    [conexao.organizationId],
  );
  for (const c of rows) {
    await sincronizarMensagens(conexao, c.id, c.chat_id, null).catch(() => undefined);
  }
  return rows.length;
}

export type EstadoSync = {
  state: "never_synced" | "syncing" | "idle";
  chatsConhecidos: number;
  chatsSincronizados: number;
  lastSyncAt: string | null;
};

/**
 * O bloco que impede o vazio mentiroso.
 *
 * A tela só mostra "não há conversa" com `state === "idle" && total === 0`. Em
 * qualquer outro caso ela mostra progresso COM DENOMINADOR -- "34 de 210" --,
 * porque sem denominador progresso é só uma ampulheta.
 *
 * O `syncing` logo depois de parear é HEURÍSTICA, e está dito em vez de
 * escondido: o OpenWA não emite sinal de "histórico terminou de chegar"
 * (procurei; não existe), então enquanto a lista ainda está vazia pouco depois
 * de conectar, o certo é dizer "trazendo" e não "não tem". Some no dia em que
 * houver esse sinal do lado de lá.
 */
export async function estadoSync(organizationId: string): Promise<EstadoSync> {
  const { rows } = await query<{
    chats_known: number; chats_synced_at: string | null; sincronizadas: number; conhecidas: number;
  }>(
    `SELECT w.chats_known, w.chats_synced_at,
            (SELECT count(*)::int FROM whatsapp_conversations c
              WHERE c.organization_id = w.organization_id AND c.sync_cursor IS NOT NULL) AS sincronizadas,
            (SELECT count(*)::int FROM whatsapp_conversations c
              WHERE c.organization_id = w.organization_id) AS conhecidas
       FROM organization_whatsapp w WHERE w.organization_id = $1`,
    [organizationId],
  );
  const linha = rows[0];
  if (!linha || !linha.chats_synced_at) {
    return { state: "never_synced", chatsConhecidos: 0, chatsSincronizados: 0, lastSyncAt: null };
  }
  const faltam = linha.conhecidas - linha.sincronizadas;
  return {
    state: faltam > 0 ? "syncing" : "idle",
    chatsConhecidos: linha.conhecidas,
    chatsSincronizados: linha.sincronizadas,
    lastSyncAt: linha.chats_synced_at,
  };
}

/**
 * Teto de sanidade da resposta individual: 30 por minuto por igreja.
 *
 * O intervalo de 3 s do disparo em massa NÃO se aplica aqui -- resposta é uma
 * pessoa digitando, e travar gente entre uma resposta e outra seria uma trava
 * sem ameaça correspondente. O que este teto pega é AUTOMAÇÃO: 30/min é uma
 * mensagem a cada 2 segundos sustentada por um minuto inteiro, que nenhuma
 * secretária alcança e que qualquer laço bate na hora.
 *
 * Contado da TABELA e não de memória: sobrevive a reinício, não precisa de
 * contador próprio e o índice já existe. Mesma técnica que o OpenWA usa.
 */
export const TETO_RESPOSTAS_POR_MINUTO = 30;

export async function assertPodeResponder(organizationId: string) {
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM whatsapp_messages
      WHERE organization_id = $1 AND from_me AND created_at > now() - interval '1 minute'`,
    [organizationId],
  );
  if (rows[0].n >= TETO_RESPOSTAS_POR_MINUTO) {
    throw new HttpError(
      429,
      `Foram ${rows[0].n} mensagens no último minuto, que é o limite. Ele existe para o número da ` +
        "igreja não ser bloqueado por parecer um robô. Espere um instante e continue.",
      "whatsapp_too_fast",
      { limit: TETO_RESPOSTAS_POR_MINUTO },
    );
  }
}

export function exigirTexto(texto: unknown): string {
  const t = typeof texto === "string" ? texto.trim() : "";
  if (!t) throw badRequest("Escreva a mensagem antes de enviar.", "message_required");
  if (t.length > 4096) throw badRequest("A mensagem passa de 4096 caracteres, que é o limite do WhatsApp.", "message_too_long");
  return t;
}
