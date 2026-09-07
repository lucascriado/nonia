"use client";

import { AuthError, apiRequest } from "@/components/auth/session";

/**
 * Fronteira única com as rotas de WhatsApp, no mesmo molde de
 * `components/auth/session.ts`: os tipos vêm do CONTRATO que o backend
 * escreveu, não da leitura da implementação dele.
 */

/**
 * Estado da conexão. `ready` é o ÚNICO em que enviar funciona -- e `connected`
 * é exatamente `status === "ready"`, então a tela nunca precisa combinar os
 * dois por conta própria.
 *
 * `failed` é terminal: não adianta esperar, precisa de QR novo.
 */
export type WhatsappStatus =
  | "not_configured"
  | "not_connected"
  | "created"
  | "initializing"
  | "qr_ready"
  | "authenticating"
  | "ready"
  | "disconnected"
  | "failed";

export type WhatsappState = {
  configured: boolean;
  connected: boolean;
  status: WhatsappStatus;
  phone?: string | null;
  pushName?: string | null;
  connectedAt?: string | null;
  /** O OpenWA não respondeu agora: os valores são o último fato conhecido. */
  stale?: boolean;
};

export type WhatsappQr = { qr: string | null; status: WhatsappStatus; connected: boolean };

export type BroadcastAudience = "members" | "visitors";
export type BroadcastStatus = "pending" | "running" | "done" | "canceled" | "failed";
export type RecipientStatus = "pending" | "sent" | "failed" | "skipped";

export type Broadcast = {
  id: string;
  message: string;
  audience: BroadcastAudience;
  status: BroadcastStatus;
  total: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdBy: string | null;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  pendingCount: number;
};

export type Recipient = {
  id: string;
  personId: string;
  name: string;
  phone: string | null;
  status: RecipientStatus;
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: string | null;
};

/** O detalhe traz os destinatários com as FALHAS primeiro, depois os pulados. */
export type BroadcastDetail = Broadcast & { estimativaSegundos: number; recipients: Recipient[] };

/**
 * A conferência antes de enviar. Não exige mensagem, não exige WhatsApp
 * conectado e não grava nada -- por isso a tela pode chamar assim que a pessoa
 * escolhe o público, e não só na hora de confirmar.
 */
export type BroadcastPreview = {
  total: number;
  comTelefone: number;
  semTelefone: number;
  acimaDoTeto: boolean;
  teto: number;
  /** A duração mora no servidor: o intervalo entre mensagens é dele. */
  estimativaSegundos: number;
};

export type BroadcastFilters = Record<string, string>;

export function getWhatsappState() {
  return apiRequest<WhatsappState>("/api/whatsapp");
}

/** 409 `whatsapp_not_connected` quando não há conexão: não é idempotente. */
export function disconnectWhatsapp() {
  return apiRequest<{ ok: true }>("/api/whatsapp", { method: "DELETE" });
}

/**
 * Cria a sessão. NÃO devolve o QR: no instante da criação ele ainda não
 * existe. Depois do 201 é o GET que passa a valer.
 */
export function createWhatsappSession() {
  return apiRequest<{ sessionId: string; status: WhatsappStatus }>("/api/whatsapp/connect", { method: "POST", body: "{}" });
}

/**
 * O QR, que o Baileys ROTACIONA a cada 20 a 60 segundos. É por aqui que a tela
 * descobre que conectou: vira `{ qr: null, status: "ready", connected: true }`.
 */
export function getWhatsappQr() {
  return apiRequest<WhatsappQr>("/api/whatsapp/connect");
}

export function listBroadcasts(page = 1, pageSize = 10) {
  return apiRequest<{ records: Broadcast[]; total: number; page: number; pageSize: number }>(
    `/api/whatsapp/broadcasts?page=${page}&pageSize=${pageSize}`,
  );
}

export function previewBroadcast(input: { audience: BroadcastAudience; filters: BroadcastFilters }) {
  return apiRequest<{ preview: BroadcastPreview }>("/api/whatsapp/broadcasts", {
    method: "POST",
    body: JSON.stringify({ ...input, preview: true }),
  });
}

export function createBroadcast(input: { audience: BroadcastAudience; message: string; filters: BroadcastFilters }) {
  return apiRequest<BroadcastPreview & { id: string }>("/api/whatsapp/broadcasts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Acompanhar. A LEITURA É O QUE EMPURRA O ENVIO: cada chamada reconcilia o
 * lote em voo e, quando não há nenhum, despacha o próximo lote de até 100.
 * Fechar a tela não interrompe o lote já despachado; acima de 100 pessoas o
 * envio pausa na virada de lote e retoma quando alguém abrir de novo.
 */
export function getBroadcast(id: string) {
  return apiRequest<BroadcastDetail>(`/api/whatsapp/broadcasts/${id}`);
}

/** Quem já recebeu, recebeu: cancelar só pula quem ainda não foi despachado. */
export function cancelBroadcast(id: string) {
  return apiRequest<{ ok: true; status: BroadcastStatus }>(`/api/whatsapp/broadcasts/${id}`, { method: "POST", body: "{}" });
}

/** Segundos em texto curto, para a frase que aparece antes de confirmar. */
export function formatDuration(segundos: number) {
  if (segundos < 90) return "menos de 2 minutos";
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `cerca de ${minutos} minutos`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `cerca de ${horas}h${String(resto).padStart(2, "0")}` : `cerca de ${horas} hora${horas > 1 ? "s" : ""}`;
}

/* ------------------------------------------------------------------ *
 * Caixa de entrada
 *
 * Os tipos abaixo vêm das rotas `app/api/whatsapp/conversas/*`, que são o
 * contrato. Três coisas que a tela NÃO pode inventar por conta própria, e por
 * isso estão anotadas aqui:
 *
 *  - marcar como lida NÃO tem rota: abrir a conversa é o que zera o não-lido,
 *    do lado do servidor. Não existe "marcar como não lida", então a tela não
 *    oferece.
 *  - o PATCH não é leitura: ele VINCULA a conversa a uma pessoa do cadastro.
 *  - a prévia de mídia vem calculada do servidor, em texto entre colchetes.
 *    A tela não tem tabela de tipos e não deve ganhar uma.
 * ------------------------------------------------------------------ */

export type SyncState = "never_synced" | "syncing" | "idle";

/**
 * O bloco que impede o vazio mentiroso.
 *
 * A tela só pode dizer "nenhuma conversa" com `state === "idle" && total === 0`.
 * Em qualquer outro caso ela mostra progresso COM DENOMINADOR, porque progresso
 * sem denominador é uma ampulheta.
 */
export type InboxSync = {
  state: SyncState;
  chatsConhecidos: number;
  chatsSincronizados: number;
  lastSyncAt: string | null;
};

export type Conversation = {
  id: string;
  chatId: string;
  /** `group` é conversa de grupo; o resto é individual. */
  kind: string;
  phone: string | null;
  /** Nome da PESSOA cadastrada quando existe; senão o nome do WhatsApp. */
  name: string | null;
  personId: string | null;
  /** Ninguém do cadastro casou com este número. */
  naoIdentificado: boolean;
  lastMessageAt: string | null;
  preview: string | null;
  unreadCount: number;
  /** Já teve o histórico buscado ao menos uma vez. */
  synced: boolean;
};

export type ConversationPage = {
  records: Conversation[];
  total: number;
  page: number;
  pageSize: number;
  sync: InboxSync;
  /** DERIVADO de ter conseguido listar, e não da coluna gravada. */
  connected: boolean;
};

export type MediaKind = "image" | "video" | "audio" | "voice" | "document" | "sticker";

export type MessageMedia = {
  /**
   * O endereço para baixar os bytes. USE COMO VEIO -- montar à mão duplicaria
   * uma regra que já mora no servidor.
   *
   * Responde 404 com frequência, e isso NÃO é erro: o gateway só guarda os
   * bytes do que viu ao vivo, então foto anterior ao pareamento responde 404
   * para sempre. É estado, e a tela mostra o marcador de texto no lugar.
   */
  url: string;
  /** Nulos no recebido: só se conhecem baixando. Preenchidos no que a igreja enviou. */
  mimetype: string | null;
  filename: string | null;
  kind: MediaKind;
};

/** A mensagem citada. `preview` já vem pronto do servidor. */
export type QuotedMessage = { waMessageId: string; preview: string };

/**
 * São ESTES doze campos, sempre. O backend tem teste que falha se aparecer um
 * décimo terceiro, então nada de ler campo que não esteja aqui.
 */
export type Message = {
  /** Do BANCO. Não serve para citar, encaminhar nem baixar mídia. */
  id: string;
  /** Do WhatsApp. É ele que vai nas três rotas acima. */
  waMessageId: string;
  fromMe: boolean;
  /** Só em grupo: quem falou. Fora de grupo é null. */
  author: string | null;
  authorName: string | null;
  type: string;
  body: string | null;
  sentAt: string;
  /** Mídia vira marcador de texto — "[foto]" —, nunca ícone e nunca cor. */
  preview: string;
  /** DERIVADO DO TIPO: true mesmo quando os bytes não vieram. */
  hasMedia: boolean;
  media: MessageMedia | null;
  quoted: QuotedMessage | null;
};

export type ConversationDetail = Conversation & {
  /** Vieram N cheias: há mais atrás, e a tela precisa dizer isso. */
  hasMore: boolean;
  deep: boolean;
  messages: Message[];
  /** O OpenWA não respondeu: o que está na tela é o último fato conhecido. */
  stale: boolean;
};

export function listConversations(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  unread?: boolean;
}) {
  const q = new URLSearchParams();
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 25));
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.unread) q.set("unread", "true");
  return apiRequest<ConversationPage>(`/api/whatsapp/conversas?${q}`);
}

/**
 * Abrir a conversa. ABRIR É O QUE SINCRONIZA, e é também o que zera o não-lido.
 *
 * `deep` é SOB DEMANDA e nunca automático: acima de 100 a rota do OpenWA avisa
 * que aumenta o risco de o WhatsApp limitar o número. Gastar esse risco sem
 * ninguém ter pedido seria decidir pela igreja.
 */
export function getConversation(id: string, deep = false) {
  return apiRequest<ConversationDetail>(`/api/whatsapp/conversas/${id}${deep ? "?deep=true" : ""}`);
}

/**
 * Responder, e opcionalmente CITANDO.
 *
 * 429 `whatsapp_too_fast` é teto de sanidade, não bloqueio da conta.
 * 404 `quoted_not_found` quando a citada não é desta conversa.
 */
export function replyToConversation(id: string, message: string, quotedWaMessageId?: string) {
  return apiRequest<{ ok: true; waMessageId: string }>(`/api/whatsapp/conversas/${id}`, {
    method: "POST",
    body: JSON.stringify(quotedWaMessageId ? { message, quotedWaMessageId } : { message }),
  });
}

/**
 * Encaminhar UMA mensagem para UM destino.
 *
 * Um destino por chamada, e é decisão do backend: vários destinos é envio em
 * massa, que tem teto de 500, intervalo de 3s e permissão própria. A tela não
 * pode transformar encaminhar em disparo por acumular cliques.
 *
 * `conversationId` na resposta é a conversa de DESTINO, que pode ter acabado de
 * ser criada — é por ela que a tela abre a conversa depois.
 */
export function forwardMessage(id: string, waMessageId: string, paraConversaId: string) {
  return apiRequest<{ ok: true; waMessageId: string; conversationId: string }>(
    `/api/whatsapp/conversas/${id}/encaminhar`,
    { method: "POST", body: JSON.stringify({ waMessageId, paraConversaId }) },
  );
}

/**
 * Enviar arquivo. Vai em `multipart/form-data`, então NÃO passa pelo
 * `apiRequest` — ele carimba `Content-Type: application/json`, e carimbar isso
 * num multipart apaga o `boundary` e o servidor devolve `invalid_form`.
 *
 * O tipo sai do mimetype do arquivo no servidor, não de um campo da tela.
 */
export async function sendMedia(
  id: string,
  arquivo: File,
  extras: { caption?: string; quotedWaMessageId?: string; voz?: boolean } = {},
) {
  const corpo = new FormData();
  corpo.set("file", arquivo);
  if (extras.caption?.trim()) corpo.set("caption", extras.caption.trim());
  if (extras.quotedWaMessageId) corpo.set("quotedWaMessageId", extras.quotedWaMessageId);
  if (extras.voz) corpo.set("voz", "true");

  const resposta = await fetch(`/api/whatsapp/conversas/${id}/midia`, {
    method: "POST",
    body: corpo,
    cache: "no-store",
    credentials: "same-origin",
  });
  const dados = (await resposta.json().catch(() => null)) as
    | { ok?: true; waMessageId?: string; type?: string; error?: string; code?: string }
    | null;
  if (!resposta.ok) {
    throw new AuthError(
      dados?.error ?? "Não foi possível enviar o arquivo.",
      dados?.code ?? "unexpected",
      resposta.status,
    );
  }
  return dados as { ok: true; waMessageId: string; type: string };
}

/** O teto do servidor, em bytes: 16 MiB. A tela recusa antes de subir. */
export const LIMITE_ARQUIVO = 16 * 1024 * 1024;
/** O teto da legenda, do servidor. */
export const LIMITE_LEGENDA = 1024;

/** Vincula a conversa a uma pessoa do cadastro; `null` desvincula. */
export function linkConversation(id: string, personId: string | null) {
  return apiRequest<{ ok: true; personId: string | null }>(`/api/whatsapp/conversas/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ personId }),
  });
}

/** O limite do WhatsApp, e o mesmo que o servidor recusa em `message_too_long`. */
export const LIMITE_MENSAGEM = 4096;
