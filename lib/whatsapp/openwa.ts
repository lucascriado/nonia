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
  if (!valor) throw new HttpError(503, "A integração com o WhatsApp não está configurada neste ambiente.", "whatsapp_not_configured");
  return valor;
}

export type ChaveCriada = { id: string; key: string; keyPrefix?: string };

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
  chamar<{ qr?: string | null }>(`/api/sessions/${sessionId}/qr`, { chave });

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
  author?: string;
  media?: { mimetype: string };
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

export const enviarTexto = (sessionId: string, chave: string, chatId: string, text: string) =>
  chamar<{ id?: string; messageId?: string }>(`/api/sessions/${sessionId}/messages/send-text`, {
    metodo: "POST",
    chave,
    corpo: { chatId, text },
  });

export const marcarLida = (sessionId: string, chave: string, chatId: string) =>
  chamar<unknown>(`/api/sessions/${sessionId}/chats/read`, { metodo: "POST", chave, corpo: { chatId } });
