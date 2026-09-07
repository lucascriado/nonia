// OpenWA de mentira, para a suíte. Modela o que eu LI no código real:
//  - x-api-key com allowedSessions, e a recusa quando a chave não alcança a sessão
//    (é o que torna o teste da segunda camada de isolamento um teste de verdade)
//  - send-bulk devolvendo batchId, e batch/:id devolvendo UMA entrada por
//    destinatário com messageId ou error
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const sessoes = new Map();   // id -> { id, name, status, phone }
const chaves = new Map();    // key -> { id, allowedSessions }
const lotes = new Map();     // batchId -> { sessionId, results }
export const controle = { falharChatIds: new Set(), statusForcado: null };
// Conversas e mensagens que o WhatsApp "empurrou" ao parear.
export const caixa = { chats: [], mensagens: new Map() };  // chatId -> [msg]
export const enviadas = [];

const ADMIN = "admin-de-teste";

const ler = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b ? JSON.parse(b) : {})); });

function autorizar(req, sessionId) {
  const k = req.headers["x-api-key"];
  if (k === ADMIN) return { ok: true, admin: true };
  const chave = chaves.get(k);
  if (!chave) return { ok: false, status: 401, message: "Invalid API key" };
  if (sessionId && chave.allowedSessions && !chave.allowedSessions.includes(sessionId)) {
    // É esta linha que o teste de isolamento exercita.
    return { ok: false, status: 403, message: "Key is not allowed for this session" };
  }
  return { ok: true };
}

export function iniciarOpenWaFalso(porta) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname.replace(/^\/api/, "");
    const responder = (status, corpo) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(corpo ?? {})); };
    const m = (re) => p.match(re);

    if (p === "/health") return responder(200, { status: "ok" });

    if (p === "/auth/api-keys" && req.method === "POST") {
      if (req.headers["x-api-key"] !== ADMIN) return responder(403, { message: "admin only" });
      const body = await ler(req);
      const key = `k-${randomUUID()}`;
      const id = randomUUID();
      chaves.set(key, { id, allowedSessions: body.allowedSessions ?? null });
      // Nomes iguais aos do OpenWA de verdade: `apiKey`, nao `key`. O stub
      // inventava e por isso concordava com o chamador em vez de contradize-lo.
      return responder(201, { id, apiKey: key, keyPrefix: key.slice(0, 12) });
    }
    let g;
    if ((g = m(/^\/auth\/api-keys\/([^/]+)\/revoke$/)) && req.method === "POST") {
      for (const [k, v] of chaves) if (v.id === g[1]) chaves.delete(k);
      return responder(200, { ok: true });
    }
    if (p === "/sessions" && req.method === "POST") {
      if (req.headers["x-api-key"] !== ADMIN) return responder(403, { message: "admin only" });
      const body = await ler(req);
      const id = randomUUID();
      sessoes.set(id, { id, name: body.name, status: "created", phone: null, pushName: null });
      return responder(201, sessoes.get(id));
    }
    if ((g = m(/^\/sessions\/([^/]+)$/))) {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      if (req.method === "DELETE") { sessoes.delete(g[1]); return responder(200, { ok: true }); }
      const s = sessoes.get(g[1]); if (!s) return responder(404, { message: "not found" });
      return responder(200, { ...s, status: controle.statusForcado ?? s.status });
    }
    if ((g = m(/^\/sessions\/([^/]+)\/(start|logout)$/)) && req.method === "POST") {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      const s = sessoes.get(g[1]); if (s) s.status = g[2] === "start" ? "qr_ready" : "disconnected";
      return responder(200, { ok: true });
    }
    if ((g = m(/^\/sessions\/([^/]+)\/qr$/))) {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      return responder(200, { qrCode: "data:image/png;base64,QR-DE-TESTE", status: "qr_ready" });
    }
    // ensureReady: no OpenWA de verdade, ler chat ou historico com a sessao fora
    // do ar responde 409. O stub modela isso -- sem ele o teste de "caiu" mentiria.
    const pronta = (id) => (controle.statusForcado ?? sessoes.get(id)?.status) === "ready";
    if ((g = m(/^\/sessions\/([^/]+)\/chats$/)) && req.method === "GET") {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      if (!pronta(g[1])) return responder(409, { message: "The session is not connected" });
      const lim = Number(url.searchParams.get("limit") || 1000);
      const off = Number(url.searchParams.get("offset") || 0);
      return responder(200, caixa.chats.slice(off, off + lim));
    }
    if ((g = m(/^\/sessions\/([^/]+)\/chats\/read$/)) && req.method === "POST") {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      return responder(200, { ok: true });
    }
    // /messages/:chatId/history -- le do WhatsApp, nao da tabela local. E a rota
    // que o nonia usa, porque o wwebjs nao semeia historico ao parear.
    if ((g = m(/^\/sessions\/([^/]+)\/messages\/([^/]+)\/history$/)) && req.method === "GET") {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      if (!pronta(g[1])) return responder(409, { message: "The session is not connected" });
      if (url.searchParams.get("includeMedia") === "true") return responder(400, { message: "o nonia pediu midia embutida" });
      const chatId = decodeURIComponent(g[2]);
      const lim = Number(url.searchParams.get("limit") || 50);
      const todas = caixa.mensagens.get(chatId) || [];
      return responder(200, todas.slice(-lim));
    }
    if ((g = m(/^\/sessions\/([^/]+)\/messages$/)) && req.method === "GET") {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      const chatId = url.searchParams.get("chatId");
      // O inlineMedia NUNCA pode chegar aqui ligado: se chegar, o teste falha.
      if (url.searchParams.get("inlineMedia") === "true") return responder(400, { message: "o nonia pediu midia embutida" });
      const todas = caixa.mensagens.get(chatId) || [];
      const after = url.searchParams.get("after");
      const i = after ? todas.findIndex((x) => x.id === after) : -1;
      return responder(200, todas.slice(i + 1));
    }
    if ((g = m(/^\/sessions\/([^/]+)\/messages\/send-text$/)) && req.method === "POST") {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      const s2 = sessoes.get(g[1]);
      if ((controle.statusForcado ?? s2?.status) !== "ready") return responder(400, { message: `Session '${g[1]}' is not active. Start the session first.` });
      const body = await ler(req);
      enviadas.push(body);
      return responder(201, { messageId: `out-${randomUUID().slice(0, 8)}` });
    }
    if ((g = m(/^\/sessions\/([^/]+)\/messages\/send-bulk$/)) && req.method === "POST") {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      const s = sessoes.get(g[1]);
      const estado = controle.statusForcado ?? s?.status;
      if (estado !== "ready") return responder(400, { message: `Session '${g[1]}' is not active. Start the session first.` });
      const body = await ler(req);
      const batchId = `b-${randomUUID()}`;
      lotes.set(batchId, {
        sessionId: g[1],
        results: body.messages.map((it) => (controle.falharChatIds.has(it.chatId)
          ? { chatId: it.chatId, status: "failed", error: { code: "RECIPIENT_UNREACHABLE", message: "numero nao existe" } }
          : { chatId: it.chatId, status: "sent", messageId: `true_${it.chatId}_${randomUUID().slice(0, 8)}`, sentAt: new Date().toISOString() })),
      });
      return responder(201, { batchId, total: body.messages.length });
    }
    if ((g = m(/^\/sessions\/([^/]+)\/messages\/batch\/([^/]+)$/))) {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      const l = lotes.get(g[2]); if (!l) return responder(404, { message: "batch not found" });
      return responder(200, { batchId: g[2], status: "completed", results: l.results });
    }
    return responder(404, { message: `sem rota falsa para ${req.method} ${p}` });
  });
  return new Promise((r) => server.listen(porta, "127.0.0.1", () => r(server)));
}

export const conectarSessao = (phone = "5511999990000") => {
  for (const s of sessoes.values()) { s.status = "ready"; s.phone = phone; s.pushName = "Igreja Teste"; }
};
export const chaveDe = (sessionId) => [...chaves.entries()].find(([, v]) => v.allowedSessions?.includes(sessionId))?.[0];
export const ADMIN_KEY = ADMIN;
