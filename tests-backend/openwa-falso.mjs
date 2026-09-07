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
export const controle = {
  falharChatIds: new Set(),
  statusForcado: null,
  // SESSAO DESVINCULADA: o WhatsApp Web foi aberto em outra janela e assumiu o
  // numero. Achado na conta real em 07/09/2026, e o sintoma e cruel -- a sessao
  // continua `ready`, continua respondendo LEITURA do armazenamento local dela,
  // e falha em toda ESCRITA com o 503 de transporte morto. Um stub que so
  // soubesse "no ar" ou "fora do ar" nao conseguiria contradizer quem confunde
  // ler com receber.
  desvinculada: false,
};
// Conversas e mensagens que o WhatsApp "empurrou" ao parear.
export const caixa = { chats: [], mensagens: new Map() };  // chatId -> [msg]
export const enviadas = [];
// Bytes que o gateway GUARDOU. Modela a assimetria do OpenWA de verdade, e ela
// e o ponto do stub: ele so guarda a midia das mensagens que viu ao vivo, entao
// foto de conversa anterior ao pareamento responde 404 PARA SEMPRE. Um stub que
// devolvesse bytes para qualquer id concordaria com o chamador em vez de
// contradize-lo -- foi assim que `qr`/`qrCode` passou.
export const midias = new Map();  // `${chatId}|${messageId}` -> { bytes, mimetype }
// Mapa @lid -> telefone. `null` e resposta legitima: o proprio OpenWA chama a
// resolucao de best-effort.
export const telefonesPorLid = new Map();
// Nome por id de contato. `undefined` no mapa = o motor nao conhece esse
// contato, e a rota responde 200 com name/pushName ausentes -- que e o que o
// OpenWA de verdade faz para quem nao esta na agenda nem tem nome de exibicao.
export const contatos = new Map();  // waId -> { name?, pushName?, number? }
// Contador de chamadas por rota. Serve a UM teste especifico: resolver contato
// e chamada de rede POR CONVERSA, e sem memoria o nonia repetiria a consulta a
// cada abertura da caixa para toda conversa que nunca resolve. Sem contar, esse
// desperdicio passaria despercebido -- o resultado final seria igual.
export const chamadas = { resolverTelefone: 0, lerContato: 0 };

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
      // O CAMPO `media` SO EXISTE COM includeMedia=true, e o stub tem que ser
      // fiel nisso -- foi aqui que ele quase repetiu o erro do `qr`/`qrCode`.
      // Devolvendo `media` sem ninguem ter pedido, um `hasMedia` deduzido da
      // presenca dos bytes PASSARIA no teste e nasceria falso contra o OpenWA
      // de verdade. Pior ainda no ar: o inline do OpenWA para de vir acima de
      // 1 MB (WEBHOOK_MEDIA_INLINE_MAX_BYTES), e quase toda foto de celular
      // passa disso. Aqui a mensagem chega SEM bytes, sempre -- quem quiser
      // saber que ha midia tem que olhar o TIPO.
      const semMidia = todas.map(({ media, ...resto }) => resto);
      return responder(200, semMidia.slice(-lim));
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
      if (controle.desvinculada) return responder(503, { message: "Transport died while sending message" });
      if ((controle.statusForcado ?? s2?.status) !== "ready") return responder(400, { message: `Session '${g[1]}' is not active. Start the session first.` });
      const body = await ler(req);
      enviadas.push(body);
      return responder(201, { messageId: `out-${randomUUID().slice(0, 8)}` });
    }
    // ENCAMINHAR. Os tres nomes sao os do ForwardMessageDto de verdade:
    // fromChatId, toChatId, messageId. Se o nonia mandar outros, isto recusa --
    // que e exatamente o servico que o stub tem que prestar.
    if ((g = m(/^\/sessions\/([^/]+)\/messages\/forward$/)) && req.method === "POST") {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      if (!pronta(g[1])) return responder(400, { message: `Session '${g[1]}' is not active. Start the session first.` });
      const body = await ler(req);
      for (const campo of ["fromChatId", "toChatId", "messageId"]) {
        if (typeof body[campo] !== "string" || !body[campo]) {
          return responder(400, { message: [`${campo} should not be empty`] });
        }
      }
      const origem = caixa.mensagens.get(body.fromChatId) || [];
      if (!origem.some((x) => x.id === body.messageId)) return responder(404, { message: "Message not found" });
      enviadas.push({ ...body, forward: true });
      return responder(201, { messageId: `fwd-${randomUUID().slice(0, 8)}`, timestamp: Math.floor(Date.now() / 1000) });
    }
    // As quatro rotas de midia. Nomes do SendMediaMessageDto: base64, mimetype,
    // filename, caption, quotedMessageId -- e `ptt` so no send-audio.
    if ((g = m(/^\/sessions\/([^/]+)\/messages\/send-(image|video|audio|document)$/)) && req.method === "POST") {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      if (!pronta(g[1])) return responder(400, { message: `Session '${g[1]}' is not active. Start the session first.` });
      const body = await ler(req);
      if (!body.chatId) return responder(400, { message: ["chatId should not be empty"] });
      if (!body.base64 && !body.url) return responder(400, { message: ["url or base64 is required"] });
      if (body.base64 && !body.mimetype) return responder(400, { message: ["mimetype is required when using base64"] });
      if (body.ptt !== undefined && g[2] !== "audio") return responder(400, { message: ["ptt is only valid on send-audio"] });
      const messageId = `out-${randomUUID().slice(0, 8)}`;
      enviadas.push({ ...body, tipo: g[2], messageId });
      // O que NOS enviamos o gateway guarda -- por isso baixar de volta funciona.
      midias.set(`${body.chatId}|${messageId}`, {
        bytes: Buffer.from(body.base64, "base64"), mimetype: body.mimetype,
      });
      return responder(201, { messageId, timestamp: Math.floor(Date.now() / 1000) });
    }
    // BAIXAR midia: octet-stream com Content-Disposition, e 404 quando o
    // gateway nao tem os bytes -- que e o caso NORMAL do historico antigo.
    if ((g = m(/^\/sessions\/([^/]+)\/messages\/([^/]+)\/([^/]+)\/media$/)) && req.method === "GET") {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      const guardada = midias.get(`${decodeURIComponent(g[2])}|${decodeURIComponent(g[3])}`);
      if (!guardada) return responder(404, { message: "No media stored for this message" });
      res.writeHead(200, {
        "content-type": guardada.mimetype,
        "content-disposition": 'attachment; filename="arquivo"',
        "x-content-type-options": "nosniff",
      });
      return res.end(guardada.bytes);
    }
    // O contato por tras de um id: e assim que o nome de quem fala num grupo
    // aparece. `name` so existe para contato salvo; `pushName` vem tambem para
    // quem nao esta na agenda. Um id desconhecido responde 200 SEM os dois --
    // nao 404 --, porque "nao sei o nome dele" e resposta, nao erro.
    if ((g = m(/^\/sessions\/([^/]+)\/contacts\/([^/]+)$/)) && req.method === "GET") {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      if (!pronta(g[1])) return responder(409, { message: "The session is not connected" });
      const waId = decodeURIComponent(g[2]);
      chamadas.lerContato += 1;
      return responder(200, { id: waId, ...(contatos.get(waId) ?? {}) });
    }
    // Resolver @lid -> telefone. `phone: null` e resposta valida, nao erro.
    if ((g = m(/^\/sessions\/([^/]+)\/contacts\/([^/]+)\/phone$/)) && req.method === "GET") {
      const a = autorizar(req, g[1]); if (!a.ok) return responder(a.status, { message: a.message });
      if (!pronta(g[1])) return responder(409, { message: "The session is not connected" });
      const contactId = decodeURIComponent(g[2]);
      chamadas.resolverTelefone += 1;
      return responder(200, { contactId, phone: telefonesPorLid.get(contactId) ?? null });
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
