// Bloco 3: caixa de entrada, leitura por cursor, sem mídia, e responder.
import pg from "/home/lucas/www/nonia-auth/node_modules/pg/lib/index.js";
import { iniciarOpenWaFalso, conectarSessao, controle, caixa, enviadas } from "../apoio/openwa-falso.mjs";
const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
async function call(m, p, { body, cookie } = {}) {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null, c: r.headers.get("set-cookie")?.split(";")[0] };
}
const servidor = await iniciarOpenWaFalso(2786);
const sql = new pg.Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/nonia" });
await sql.connect(); await sql.query("SET TIME ZONE 'UTC'");
const u = Date.now().toString(36);
const agora = Math.floor(Date.now() / 1000);

let r = await call("POST", "/api/auth/register", { body: { organizationName: `Cx ${u}`, fullName: "Dona", email: `d${u}@x.test`, password: "senha1234" } });
const A = r.c, orgA = r.d.organization.id;
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });
ok(r.s === 201, "cadastro", r.s);

console.log("\n== antes de conectar: vazio HONESTO ==");
r = await call("GET", "/api/whatsapp/conversas", { cookie: A });
ok(r.s === 200 && r.d.total === 0, "responde 200, não erro", r.s);
ok(r.d.sync.state === "never_synced", "e state = never_synced, NÃO idle -- a tela não pode dizer 'não tem'", r.d.sync?.state);

console.log("\n== conectar: a lista inteira vem, e é o que cumpre 'carregou meus chats' ==");
await call("POST", "/api/members", { cookie: A, body: { name: "Maria Membro", phone: "(11) 98888-1111" } });
await call("POST", "/api/whatsapp/connect", { cookie: A });
conectarSessao();
// O que o WhatsApp empurrou ao parear: 4 conversas, uma delas de alguém cadastrado.
caixa.chats = [
  { id: "5511988881111@c.us", name: "Maria", isGroup: false, kind: "individual", unreadCount: 2, timestamp: agora - 60, lastMessage: "oi pastor", archived: false, pinned: false },
  { id: "5511977772222@c.us", name: "Desconhecido", isGroup: false, kind: "individual", unreadCount: 1, timestamp: agora - 3600, lastMessage: "bom dia", archived: false, pinned: false },
  { id: "120363000@g.us", name: "Grupo Louvor", isGroup: true, kind: "group", unreadCount: 0, timestamp: agora - 7200, lastMessage: "ensaio", archived: false, pinned: false },
  { id: "8899@lid", name: "Sem Numero", isGroup: false, kind: "individual", unreadCount: 0, timestamp: agora - 9000, lastMessage: "ola", archived: false, pinned: false },
];
caixa.mensagens.set("5511988881111@c.us", [
  { id: "m1", chatId: "5511988881111@c.us", from: "5511988881111@c.us", body: "oi pastor", type: "text", timestamp: agora - 120, fromMe: false },
  { id: "m2", chatId: "5511988881111@c.us", from: "eu", body: "", type: "image", timestamp: agora - 90, fromMe: false, media: { mimetype: "image/jpeg" } },
  { id: "m3", chatId: "5511988881111@c.us", from: "eu", body: "olha a foto", type: "image", timestamp: agora - 80, fromMe: false, media: { mimetype: "image/jpeg" } },
  { id: "m4", chatId: "5511988881111@c.us", from: "eu", body: "", type: "voice", timestamp: agora - 70, fromMe: false, media: { mimetype: "audio/ogg" } },
  { id: "m5", chatId: "5511988881111@c.us", from: "eu", body: "", type: "revoked", timestamp: agora - 60, fromMe: false },
]);
r = await call("GET", "/api/whatsapp/conversas", { cookie: A });
ok(r.s === 200 && r.d.total === 4, "as 4 conversas apareceram", r.d?.total);
ok(r.d.records[0].chatId === "5511988881111@c.us", "ordenadas por última atividade, mais recente primeiro", r.d.records[0]?.chatId);
ok(r.d.connected === true, "e a resposta diz que está conectado", r.d?.connected);

console.log("\n== casamento com o cadastro, e o @lid ==");
const maria = r.d.records.find((c) => c.chatId === "5511988881111@c.us");
ok(maria.name === "Maria Membro", "quem está cadastrado aparece com o nome DA FICHA, não do WhatsApp", maria?.name);
ok(maria.naoIdentificado === false, "e não é 'não identificado'", maria?.naoIdentificado);
const desconhecido = r.d.records.find((c) => c.chatId === "5511977772222@c.us");
ok(desconhecido.personId === null && desconhecido.naoIdentificado === true, "número que não é de ninguém: person_id NULL, marcado como não identificado", JSON.stringify([desconhecido?.personId, desconhecido?.naoIdentificado]));
const lid = r.d.records.find((c) => c.chatId === "8899@lid");
ok(lid && lid.phone === null && lid.personId === null, "@lid: SEM TELEFONE e sem pessoa -- caso normal, não erro", JSON.stringify([lid?.phone, lid?.personId]));
const grupo = r.d.records.find((c) => c.kind === "group");
ok(Boolean(grupo) && grupo.phone === null, "grupo entra como grupo, sem telefone", grupo?.kind);

console.log("\n== 'ainda carregando' vs 'não tem nada' ==");
ok(r.d.sync.chatsConhecidos === 4, "o denominador existe: 4 conhecidas", r.d.sync?.chatsConhecidos);
ok(typeof r.d.sync.chatsSincronizados === "number", "e o numerador também", r.d.sync?.chatsSincronizados);
ok(["syncing", "idle"].includes(r.d.sync.state), "state deixou de ser never_synced", r.d.sync?.state);
r = await call("GET", "/api/whatsapp/conversas?search=nao-existe-ninguem", { cookie: A });
ok(r.d.total === 0 && r.d.sync.state !== "never_synced",
   "busca sem resultado NÃO vira 'nunca sincronizou' -- vazio de filtro é outro vazio", JSON.stringify([r.d.total, r.d.sync?.state]));

console.log("\n== abrir a conversa traz as mensagens ==");
r = await call("GET", "/api/whatsapp/conversas", { cookie: A });
const idMaria = r.d.records.find((c) => c.chatId === "5511988881111@c.us").id;
r = await call("GET", `/api/whatsapp/conversas/${idMaria}`, { cookie: A });
ok(r.s === 200 && r.d.messages.length === 5, "as 5 mensagens vieram", r.d?.messages?.length);
ok(r.d.messages[0].body === "oi pastor", "texto vem como texto", r.d.messages[0]?.body);

console.log("\n== MÍDIA: marcador de texto, nunca linha vazia ==");
const porId = Object.fromEntries(r.d.messages.map((m) => [m.waMessageId, m]));
const porTipo = Object.fromEntries(r.d.messages.map((m) => [m.type, m.preview]));
ok(porId.m2.preview === "[foto]", "foto sem legenda -> [foto]", porId.m2?.preview);
ok(r.d.messages.find((m) => m.body === "olha a foto").preview === "[foto] olha a foto", "foto COM legenda mostra as duas coisas", "");
ok(porTipo.voice === "[mensagem de voz]", "nota de voz é diferente de áudio", porTipo.voice);
ok(porTipo.revoked === "[mensagem apagada]", "apagada aparece, em vez de deixar buraco na conversa", porTipo.revoked);
ok(r.d.messages.every((m) => (m.preview || "").length > 0), "NENHUMA mensagem vira linha vazia", "");
ok(r.d.messages.filter((m) => m.hasMedia).length === 3, "e o fato de haver mídia é guardado", "");

console.log("\n== a mídia NÃO é copiada ==");
const colunas = (await sql.query("SELECT column_name FROM information_schema.columns WHERE table_name='whatsapp_messages'")).rows.map((x) => x.column_name);
ok(!colunas.some((c) => /data|base64|content|blob/.test(c)), "não existe coluna para o conteúdo da mídia", colunas.join(","));
const pesado = (await sql.query("SELECT max(length(body))::int AS n FROM whatsapp_messages WHERE organization_id=$1", [orgA])).rows[0].n;
ok((pesado ?? 0) < 200, "e nenhum corpo guardado é grande (base64 seria dezenas de KB)", pesado);
// O stub RECUSA inlineMedia=true; se o nonia pedisse, a sincronização falharia e nada teria vindo.
ok(r.d.messages.length === 5, "o nonia nunca pediu inlineMedia -- o stub recusaria e a conversa viria vazia", "");

console.log("\n== cursor: reler não duplica ==");
caixa.mensagens.get("5511988881111@c.us").push(
  { id: "m6", chatId: "5511988881111@c.us", from: "x", body: "mensagem nova", type: "text", timestamp: agora - 10, fromMe: false });
r = await call("GET", `/api/whatsapp/conversas/${idMaria}`, { cookie: A });
ok(r.d.messages.length === 6, "a mensagem nova entrou", r.d?.messages?.length);
await call("GET", `/api/whatsapp/conversas/${idMaria}`, { cookie: A });
r = await call("GET", `/api/whatsapp/conversas/${idMaria}`, { cookie: A });
ok(r.d.messages.length === 6, "e reler três vezes NÃO duplica nada", r.d?.messages?.length);

console.log("\n== responder ==");
const antes = enviadas.length;
r = await call("POST", `/api/whatsapp/conversas/${idMaria}`, { cookie: A, body: { message: "Bom dia, Maria!" } });
ok(r.s === 201, "resposta aceita", `${r.s} ${r.d?.code}`);
ok(enviadas.length === antes + 1 && enviadas.at(-1).chatId === "5511988881111@c.us", "e chegou ao OpenWA, no chat certo", JSON.stringify(enviadas.at(-1)));
r = await call("GET", `/api/whatsapp/conversas/${idMaria}`, { cookie: A });
const minha = r.d.messages.find((m) => m.fromMe);
ok(Boolean(minha) && minha.body === "Bom dia, Maria!", "a resposta fica gravada na conversa", minha?.body);
r = await call("POST", `/api/whatsapp/conversas/${idMaria}`, { cookie: A, body: { message: "   " } });
ok(r.s === 400 && r.d.code === "message_required", "resposta vazia -> 400", `${r.s} ${r.d?.code}`);
r = await call("POST", `/api/whatsapp/conversas/${idMaria}`, { cookie: A, body: { message: "x".repeat(4097) } });
ok(r.s === 400 && r.d.code === "message_too_long", "acima de 4096 -> 400", `${r.s} ${r.d?.code}`);

console.log("\n== teto de sanidade: pega automação, não gente ==");
let ultimo = null;
for (let i = 0; i < 32; i++) ultimo = await call("POST", `/api/whatsapp/conversas/${idMaria}`, { cookie: A, body: { message: `laco ${i}` } });
ok(ultimo.s === 429 && ultimo.d.code === "whatsapp_too_fast", "um laço de 30+ mensagens no minuto é barrado -> 429", `${ultimo.s} ${ultimo.d?.code}`);
ok(/bloqueado/.test(ultimo.d?.error || ""), "e a mensagem diz por que o limite existe", ultimo.d?.error);

console.log("\n== vincular à pessoa, sem inventar ninguém ==");
r = await call("GET", "/api/whatsapp/conversas", { cookie: A });
const idDesc = r.d.records.find((c) => c.chatId === "5511977772222@c.us").id;
const pessoas = (await call("GET", "/api/members?pageSize=10", { cookie: A })).d.records;
r = await call("PATCH", `/api/whatsapp/conversas/${idDesc}`, { cookie: A, body: { personId: pessoas[0].id } });
ok(r.s === 200, "vincula à pessoa escolhida por quem está olhando", r.s);
r = await call("GET", "/api/whatsapp/conversas", { cookie: A });
ok(r.d.records.find((c) => c.id === idDesc).naoIdentificado === false, "deixa de ser não identificada", "");
// A sincronização seguinte não pode desfazer decisão de gente.
await call("GET", "/api/whatsapp/conversas", { cookie: A });
r = await call("GET", "/api/whatsapp/conversas", { cookie: A });
ok(r.d.records.find((c) => c.id === idDesc).personId === pessoas[0].id, "e a sincronização seguinte NÃO desfaz o vínculo feito à mão", "");
r = await call("PATCH", `/api/whatsapp/conversas/${idDesc}`, { cookie: A, body: { personId: null } });
ok(r.s === 200, "e dá para desvincular", r.s);

console.log("\n== isolamento ==");
r = await call("POST", "/api/auth/register", { body: { organizationName: `Cx B ${u}`, fullName: "Outro", email: `o${u}@x.test`, password: "senha1234" } });
const B = r.c;
r = await call("GET", "/api/whatsapp/conversas", { cookie: B });
ok(r.d.total === 0, "a igreja B não vê nenhuma conversa da A", r.d?.total);
r = await call("GET", `/api/whatsapp/conversas/${idMaria}`, { cookie: B });
ok(r.s === 404, "abrir conversa da outra igreja -> 404, sem confirmar que existe", r.s);
r = await call("POST", `/api/whatsapp/conversas/${idMaria}`, { cookie: B, body: { message: "invadindo" } });
ok(r.s === 404, "e responder nela também -> 404", r.s);

console.log("\n== permissões ==");
const conv = await call("POST", "/api/users", { cookie: A, body: { email: `sec${u}@x.test`, fullName: "Secretaria", roleSlug: "secretaria" } });
const tk = conv.d.inviteUrl.split("/convite/")[1];
const sec = (await call("POST", "/api/auth/invite/accept", { body: { token: tk, fullName: "Secretaria", password: "senha1234" } })).c;
r = await call("GET", "/api/whatsapp/conversas", { cookie: sec });
ok(r.s === 200, "a secretaria LÊ a caixa (whatsapp.read)", r.s);
r = await call("POST", `/api/whatsapp/conversas/${idMaria}`, { cookie: sec, body: { message: "posso responder?" } });
ok(r.s === 429 || r.s === 201, "e RESPONDE (whatsapp.write) -- é ela quem atende", `${r.s} ${r.d?.code}`);
const leitura = await call("POST", "/api/users", { cookie: A, body: { email: `lei${u}@x.test`, fullName: "Leitura", roleSlug: "leitura" } });
const tk2 = leitura.d.inviteUrl.split("/convite/")[1];
const lei = (await call("POST", "/api/auth/invite/accept", { body: { token: tk2, fullName: "Leitura", password: "senha1234" } })).c;
r = await call("GET", "/api/whatsapp/conversas", { cookie: lei });
ok(r.s === 403, "o papel Leitura não tem whatsapp.read -> 403", r.s);

console.log("\n== WhatsApp caiu: a caixa continua legível ==");
controle.statusForcado = "disconnected";
r = await call("GET", "/api/whatsapp/conversas", { cookie: A });
ok(r.s === 200 && r.d.total >= 4, "a lista já trazida continua aparecendo", `${r.s} ${r.d?.total}`);
ok(r.d.connected === false, "e a resposta diz que caiu", r.d?.connected);
r = await call("GET", `/api/whatsapp/conversas/${idMaria}`, { cookie: A });
ok(r.s === 200 && r.d.stale === true, "abrir conversa devolve o que há, marcado como desatualizado", `${r.s} ${r.d?.stale}`);
r = await call("POST", `/api/whatsapp/conversas/${idMaria}`, { cookie: A, body: { message: "vai falhar" } });
ok(r.s === 502 || r.s === 429, "e responder falha em vez de fingir que enviou", `${r.s} ${r.d?.code}`);
controle.statusForcado = null;

await sql.end(); servidor.close();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
