import { HttpError } from "@/lib/http";

/**
 * O único lugar que sabe falar com o OpenWA.
 *
 * Duas credenciais, com papéis diferentes de propósito:
 *
 *   OPENWA_ADMIN_KEY  chave de administração, usada SÓ para criar e revogar a
 *                     chave de cada igreja. Nunca sai daqui e nunca é usada
 *                     para enviar mensagem.
 *   a chave da igreja  restrita à sessão dela (`allowedSessions`), guardada
 *                     cifrada, e é ela que envia. É a segunda camada de
 *                     isolamento: um erro de escopo aqui dentro não alcança a
 *                     sessão de outra igreja porque o OpenWA recusa.
 *
 * O OpenWA hospeda N sessões, UMA POR IGREJA -- e passa a hospedar também as de
 * outros sistemas, quando a vr-ticket migrar para ele. Nada aqui fala de "a"
 * sessão: toda chamada recebe o `sessionId` da igreja em questão.
 */

/**
 * A base SEMPRE vem de `OPENWA_URL`. O 127.0.0.1 é só o padrão de ausência,
 * nunca um endereço fixo: o OpenWA vai para a VPS, e o nonia local vai
 * alcançá-lo por túnel -- exatamente como já faz com o Postgres. Mudança de
 * casa tem que ser uma variável de ambiente, não um diff.
 */
const BASE = () => (process.env.OPENWA_URL || "http://127.0.0.1:2785").replace(/\/+$/, "");

export function openwaConfigurado(): boolean {
  return Boolean(process.env.OPENWA_ADMIN_KEY);
}

type Opcoes = { metodo?: string; corpo?: unknown; chave: string; timeoutMs?: number };

async function chamar<T>(caminho: string, { metodo = "GET", corpo, chave, timeoutMs = 20000 }: Opcoes): Promise<T> {
  const controller = new AbortController();
  const relogio = setTimeout(() => controller.abort(), timeoutMs);
  let resposta: Response;
  try {
    resposta = await fetch(`${BASE()}${caminho}`, {
      method: metodo,
      headers: { "content-type": "application/json", "x-api-key": chave },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (erro) {
    // O OpenWA fora do ar não é erro do nonia, e a mensagem tem que dizer isso:
    // "erro interno" mandaria a igreja procurar defeito no lugar errado.
    throw new HttpError(
      503,
      "O serviço de WhatsApp não respondeu. Ele roda separado do nonia; se acabou de reiniciar, tente de novo em instantes.",
      "whatsapp_unavailable",
      { causa: erro instanceof Error ? erro.name : "desconhecida" },
    );
  } finally {
    clearTimeout(relogio);
  }

  const texto = await resposta.text();
  const dados = texto ? safeJson(texto) : null;
  if (!resposta.ok) {
    throw new HttpError(
      resposta.status === 404 ? 404 : 502,
      mensagemDoOpenWa(dados) ?? `O serviço de WhatsApp recusou a operação (HTTP ${resposta.status}).`,
      "whatsapp_error",
      { status: resposta.status },
    );
  }
  return dados as T;
}

function safeJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function mensagemDoOpenWa(dados: unknown): string | null {
  if (dados && typeof dados === "object" && "message" in dados) {
    const m = (dados as { message: unknown }).message;
    if (typeof m === "string") return m;
    if (Array.isArray(m) && typeof m[0] === "string") return m[0];
  }
  return null;
}

// --- administração: criar e revogar a chave de uma igreja -------------------

function chaveAdmin(): string {
  const valor = process.env.OPENWA_ADMIN_KEY;
  if (!valor) {
    throw new HttpError(
      503,
      "A integração com o WhatsApp não está configurada neste ambiente: falta OPENWA_ADMIN_KEY.",
      "whatsapp_not_configured",
      { faltando: ["OPENWA_ADMIN_KEY"] },
    );
  }
  return valor;
}

/**
  * Os NOMES aqui vieram do DTO do OpenWA, não de suposição -- e a diferença
  * custou dois 500 no primeiro pareamento de verdade: a chave crua chama-se
  * `apiKey` (ApiKeyCreatedResponseDto) e o QR chama-se `qrCode`
  * (QRCodeResponseDto, "QR code as data URL"). O stub da suíte tinha inventado
  * `key` e `qr`, então o teste concordava comigo em vez de me contradizer.
  */
export type ChaveCriada = { id: string; apiKey: string; keyPrefix?: string };

export function criarChaveDaSessao(nome: string, sessionId: string) {
  return chamar<ChaveCriada>("/api/auth/api-keys", {
    metodo: "POST",
    chave: chaveAdmin(),
    // `allowedSessions` é o ponto inteiro desta chamada: a chave devolvida só
    // alcança esta sessão, aconteça o que acontecer do lado de cá.
    corpo: { name: nome, role: "operator", allowedSessions: [sessionId] },
  });
}

export function revogarChave(apiKeyId: string) {
  return chamar<unknown>(`/api/auth/api-keys/${apiKeyId}/revoke`, { metodo: "POST", chave: chaveAdmin() });
}

export type SessaoCriada = { id: string; name: string; status: string };

export function criarSessao(nome: string) {
  return chamar<SessaoCriada>("/api/sessions", { metodo: "POST", chave: chaveAdmin(), corpo: { name: nome } });
}

export function apagarSessao(sessionId: string) {
  return chamar<unknown>(`/api/sessions/${sessionId}`, { metodo: "DELETE", chave: chaveAdmin() });
}

// --- operação: já com a chave da igreja ------------------------------------

export type SessaoLida = {
  id: string;
  name: string;
  status: string;
  phone?: string | null;
  pushName?: string | null;
  connectedAt?: string | null;
};

export const lerSessao = (sessionId: string, chave: string) =>
  chamar<SessaoLida>(`/api/sessions/${sessionId}`, { chave });

export const iniciarSessao = (sessionId: string, chave: string) =>
  chamar<unknown>(`/api/sessions/${sessionId}/start`, { metodo: "POST", chave });

export const lerQr = (sessionId: string, chave: string) =>
  chamar<{ qrCode?: string | null }>(`/api/sessions/${sessionId}/qr`, { chave });

export const desconectarSessao = (sessionId: string, chave: string) =>
  chamar<unknown>(`/api/sessions/${sessionId}/logout`, { metodo: "POST", chave });

export type ItemDoLote = { chatId: string; type: "text"; content: { text: string } };

export type LoteCriado = { batchId: string; total?: number };

export function enviarLote(sessionId: string, chave: string, itens: ItemDoLote[], batchId?: string) {
  return chamar<LoteCriado>(`/api/sessions/${sessionId}/messages/send-bulk`, {
    metodo: "POST",
    chave,
    corpo: {
      ...(batchId ? { batchId } : {}),
      messages: itens,
      // Os padrões do OpenWA já são os que queremos, mas ficam explícitos: é o
      // intervalo que impede o número da igreja de ser bloqueado, e valor que
      // protege alguém não pode depender de um default do outro lado.
      options: { delayBetweenMessages: INTERVALO_MS, randomizeDelay: true, stopOnError: false },
    },
    timeoutMs: 30000,
  });
}

export type ResultadoDoDestinatario = {
  chatId?: string;
  status?: string;
  messageId?: string;
  error?: { code?: string; message?: string };
  sentAt?: string;
};

export type LoteLido = {
  batchId: string;
  status?: string;
  results?: ResultadoDoDestinatario[];
};

export const lerLote = (sessionId: string, chave: string, batchId: string) =>
  chamar<LoteLido>(`/api/sessions/${sessionId}/messages/batch/${batchId}`, { chave });

export const cancelarLote = (sessionId: string, chave: string, batchId: string) =>
  chamar<unknown>(`/api/sessions/${sessionId}/messages/batch/${batchId}/cancel`, { metodo: "POST", chave });

/** Intervalo entre mensagens, em ms. Igual ao padrão do OpenWA (mínimo aceito: 1000). */
export const INTERVALO_MS = 3000;
/** O `randomizeDelay` soma de 0 a 2 s. A média entra na estimativa de duração. */
export const JITTER_MEDIO_MS = 1000;
/** Teto do OpenWA por lote (`ArrayMaxSize(100)`). Acima disso, o nonia encadeia. */
export const LOTE_MAX = 100;

// --- caixa de entrada ------------------------------------------------------

export type ConversaLida = {
  id: string;
  name: string;
  isGroup: boolean;
  kind: string;
  unreadCount: number;
  /** Unix em SEGUNDOS, não milissegundos. */
  timestamp: number;
  lastMessage?: string;
  archived: boolean;
  pinned: boolean;
};

export const listarConversas = (sessionId: string, chave: string, limit = 1000, offset = 0) =>
  chamar<ConversaLida[]>(`/api/sessions/${sessionId}/chats?limit=${limit}&offset=${offset}`, { chave, timeoutMs: 45000 });

export type MensagemLida = {
  id: string;
  chatId: string;
  from: string;
  body: string;
  type: string;
  timestamp: number;
  fromMe: boolean;
  /** Em GRUPO, `from` é o grupo -- `author` é o único jeito de saber quem falou. */
  author?: string;
  isGroup?: boolean;
  /**
   * Nome de quem falou, vindo do `notifyName` do payload cru. É síncrono (não
   * custa consulta de contato) e é o que faz um grupo não virar um monte de
   * balão sem dono.
   */
  contact?: { name?: string; pushName?: string };
  /** Presente só com `includeMedia=true`, que NÃO pedimos. Ver `lerHistorico`. */
  media?: { mimetype: string };
  /** A mensagem que ESTA cita. O OpenWA já resolve o texto dela para nós. */
  quotedMessage?: { id: string; body?: string };
};

/**
 * Histórico de uma conversa, LIDO DO WHATSAPP e não da tabela do OpenWA.
 *
 * A distinção é o que faz a caixa não nascer vazia. A rota /messages?after=
 * lê a tabela local do OpenWA, e o motor em uso -- whatsapp-web.js, o padrão
 * quando ENGINE_TYPE não está definido -- NÃO semeia histórico ao parear: não
 * existe `onHistoryMessages` no adaptador dele. Só o Baileys empurra
 * `messaging-history.set`. Com o motor em uso, a tabela local só tem o que
 * chegou depois de o gateway subir, então ler de lá mostraria a lista de
 * conversas certa e TODAS AS CONVERSAS VAZIAS.
 *
 * Esta rota, por outro lado, "reads messages directly from the WhatsApp client
 * for the given chat, bypassing the local DB".
 *
 * `includeMedia` fica fora: o padrão é não embutir, e é o que queremos --
 * pedir mídia traria base64 por mensagem, o erro dos 43 MB numa escala maior.
 */
export const TETO_HISTORICO = 100;

export const lerHistorico = (sessionId: string, chave: string, chatId: string, limit = TETO_HISTORICO, deep = false) =>
  chamar<MensagemLida[]>(
    `/api/sessions/${sessionId}/messages/${encodeURIComponent(chatId)}/history?limit=${limit}` +
      (deep ? "&deep=true" : ""),
    { chave, timeoutMs: 45000 },
  );

export type MensagemEnviada = { id?: string; messageId?: string };

/**
 * `quotedMessageId` opcional em vez de uma rota `/reply` separada.
 *
 * O OpenWA tem as duas: `send-text` aceita `quotedMessageId` e existe um
 * `/messages/reply` dedicado. Responder citando é a MESMA operação de enviar
 * com um campo a mais -- dois caminhos aqui dentro dariam dois lugares para o
 * teto de resposta, a gravação e a atividade divergirem.
 */
export const enviarTexto = (
  sessionId: string,
  chave: string,
  chatId: string,
  text: string,
  quotedMessageId?: string | null,
) =>
  chamar<MensagemEnviada>(`/api/sessions/${sessionId}/messages/send-text`, {
    metodo: "POST",
    chave,
    corpo: { chatId, text, ...(quotedMessageId ? { quotedMessageId } : {}) },
  });

/**
 * ENCAMINHAR. Os três nomes vieram do `ForwardMessageDto`, não de suposição:
 * `fromChatId`, `toChatId`, `messageId` -- e o de origem é obrigatório porque o
 * WhatsApp precisa achar a mensagem no chat em que ela está.
 */
export const encaminhar = (
  sessionId: string,
  chave: string,
  fromChatId: string,
  toChatId: string,
  messageId: string,
) =>
  chamar<MensagemEnviada>(`/api/sessions/${sessionId}/messages/forward`, {
    metodo: "POST",
    chave,
    corpo: { fromChatId, toChatId, messageId },
    timeoutMs: 30000,
  });

/** As quatro rotas de mídia do OpenWA, e o `ptt` que separa nota de voz de arquivo de áudio. */
export type TipoDeMidia = "image" | "video" | "audio" | "document";

export function enviarMidia(
  sessionId: string,
  chave: string,
  tipo: TipoDeMidia,
  corpo: {
    chatId: string;
    base64: string;
    mimetype: string;
    filename?: string;
    caption?: string;
    quotedMessageId?: string | null;
    ptt?: boolean;
  },
) {
  const { quotedMessageId, ...resto } = corpo;
  return chamar<MensagemEnviada>(`/api/sessions/${sessionId}/messages/send-${tipo}`, {
    metodo: "POST",
    chave,
    corpo: { ...resto, ...(quotedMessageId ? { quotedMessageId } : {}) },
    // Mídia sobe mais devagar que texto: 20 s derrubaria um vídeo de 10 MB no
    // meio do caminho e o remetente veria erro de uma mensagem que foi enviada.
    timeoutMs: 60000,
  });
}

export type MidiaBaixada = { bytes: ArrayBuffer; mimetype: string; filename: string | null };

/**
 * Baixa os BYTES de uma mídia recebida.
 *
 * Fora do `chamar` de propósito: aquele desserializa JSON, e aqui a resposta é
 * binária. E a assimetria com o 404 é intencional -- 404 aqui é caso NORMAL, não
 * defeito: o gateway só guarda os bytes do que viu ao vivo, então mídia de
 * conversa anterior ao pareamento simplesmente não existe do lado de lá. Quem
 * chama transforma isso em "[foto] indisponível", não em erro.
 */
export async function baixarMidia(
  sessionId: string,
  chave: string,
  chatId: string,
  messageId: string,
): Promise<MidiaBaixada> {
  const controller = new AbortController();
  const relogio = setTimeout(() => controller.abort(), 60000);
  let resposta: Response;
  try {
    resposta = await fetch(
      `${BASE()}/api/sessions/${sessionId}/messages/${encodeURIComponent(chatId)}/${encodeURIComponent(messageId)}/media`,
      { headers: { "x-api-key": chave }, signal: controller.signal, cache: "no-store" },
    );
  } catch (erro) {
    throw new HttpError(
      503,
      "O serviço de WhatsApp não respondeu. Ele roda separado do nonia; se acabou de reiniciar, tente de novo em instantes.",
      "whatsapp_unavailable",
      { causa: erro instanceof Error ? erro.name : "desconhecida" },
    );
  } finally {
    clearTimeout(relogio);
  }

  if (resposta.status === 404) {
    throw new HttpError(
      404,
      "Esta mídia não está mais ao alcance. O WhatsApp guarda o arquivo no aparelho, e o histórico " +
        "trazido no pareamento vem só com o texto.",
      "midia_indisponivel",
    );
  }
  if (!resposta.ok) {
    throw new HttpError(502, `O serviço de WhatsApp recusou a mídia (HTTP ${resposta.status}).`, "whatsapp_error", {
      status: resposta.status,
    });
  }
  const disposicao = resposta.headers.get("content-disposition") ?? "";
  const nome = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposicao)?.[1] ?? null;
  return {
    bytes: await resposta.arrayBuffer(),
    mimetype: resposta.headers.get("content-type") ?? "application/octet-stream",
    filename: nome ? decodeURIComponent(nome) : null,
  };
}

/**
 * Resolve um `@lid` para telefone.
 *
 * O WhatsApp passou a identificar gente por `@lid` em vez do número, e a conta
 * real com que isto foi medido devolve `@lid` em TODAS as conversas. Sem esta
 * chamada, `telefoneDoChat` não acha número nenhum, nenhuma conversa casa com o
 * cadastro e a caixa inteira aparece como "não identificado".
 *
 * "Best-effort" é palavra do próprio OpenWA: `phone: null` não afirma que a
 * pessoa não tem número, só que ele ainda não aprendeu o mapa. Por isso a falha
 * aqui nunca derruba a sincronização -- ela deixa a conversa sem telefone, que é
 * o estado que já existia.
 */
export const resolverTelefone = (sessionId: string, chave: string, contactId: string) =>
  chamar<{ contactId: string; phone: string | null }>(
    `/api/sessions/${sessionId}/contacts/${encodeURIComponent(contactId)}/phone`,
    { chave },
  );

export const marcarLida = (sessionId: string, chave: string, chatId: string) =>
  chamar<unknown>(`/api/sessions/${sessionId}/chats/read`, { metodo: "POST", chave, corpo: { chatId } });
