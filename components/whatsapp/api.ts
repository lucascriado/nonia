"use client";

import { apiRequest } from "@/components/auth/session";

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
