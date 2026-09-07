// "Como se fosse o WhatsApp dele": encaminhar, responder citando, mídia nos
// dois sentidos, e o @lid que fazia a caixa inteira aparecer sem nome.
//
// O nome da suíte é o pedido do Lucas: espelhar o WhatsApp, não ler mensagens.
import pg from "/home/lucas/www/nonia-auth/node_modules/pg/lib/index.js";
import { iniciarOpenWaFalso, conectarSessao, caixa, enviadas, midias, telefonesPorLid, chamadas } from "./openwa-falso.mjs";
const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
async function call(m, p, { body, cookie } = {}) {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null, c: r.headers.get("set-cookie")?.split(";")[0] };
}
// Mídia sobe por multipart, e o teste tem que subir do mesmo jeito que o
// navegador: JSON com base64 aqui provaria um caminho que ninguém usa.
async function enviarArquivo(p, cookie, { bytes, nome, tipo, caption, quotedWaMessageId, voz }) {
  const fd = new FormData();
  fd.append("file", new File([bytes], nome, { type: tipo }));
  if (caption) fd.append("caption", caption);
  if (quotedWaMessageId) fd.append("quotedWaMessageId", quotedWaMessageId);
  if (voz) fd.append("voz", "true");
  const r = await fetch(BASE + p, { method: "POST", headers: { cookie }, body: fd, redirect: "manual" });
  return { s: r.status, d: await r.json().catch(() => null) };
}
async function baixar(p, cookie) {
  const r = await fetch(BASE + p, { headers: { cookie }, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, ct, cd: r.headers.get("content-disposition"), nosniff: r.headers.get("x-content-type-options"),
           bytes: ct.includes("json") ? null : Buffer.from(await r.arrayBuffer()),
           d: ct.includes("json") ? await r.json().catch(() => null) : null };
}

const servidor = await iniciarOpenWaFalso(2786);
const sql = new pg.Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/nonia" });
await sql.connect(); await sql.query("SET TIME ZONE 'UTC'");
const u = Date.now().toString(36);
const agora = Math.floor(Date.now() / 1000);

let r = await call("POST", "/api/auth/register", { body: { organizationName: `Esp ${u}`, fullName: "Dona", email: `e${u}@x.test`, password: "senha1234" } });
const A = r.c, orgA = r.d.organization.id;
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });
await call("POST", "/api/members", { cookie: A, body: { name: "Maria Membro", phone: "(11) 98888-1111" } });
await call("POST", "/api/members", { cookie: A, body: { name: "Zeca Sem Telefone" } });
await call("POST", "/api/whatsapp/connect", { cookie: A });
conectarSessao();

// TUDO chega como @lid, que é o que a conta real devolve. Nenhum @c.us aqui de
// propósito: com @c.us o defeito não aparece.
telefonesPorLid.set("111@lid", "5511988881111");   // é a Maria do cadastro
telefonesPorLid.set("222@lid", "5511977772222");   // ninguém conhecido
// 333@lid não resolve nunca -- o motor não aprendeu o mapa.
caixa.chats = [
  { id: "111@lid", name: "Maria", isGroup: false, kind: "individual", unreadCount: 0, timestamp: agora - 60, lastMessage: "oi", archived: false, pinned: false },
  { id: "222@lid", name: "Alguem", isGroup: false, kind: "individual", unreadCount: 0, timestamp: agora - 120, lastMessage: "bom dia", archived: false, pinned: false },
  { id: "333@lid", name: "Nunca Resolve", isGroup: false, kind: "individual", unreadCount: 0, timestamp: agora - 180, lastMessage: "ola", archived: false, pinned: false },
  { id: "120363@g.us", name: "Grupo Louvor", isGroup: true, kind: "group", unreadCount: 0, timestamp: agora - 240, lastMessage: "ensaio", archived: false, pinned: false },
];
caixa.mensagens.set("111@lid", [
  { id: "a1", chatId: "111@lid", from: "111@lid", body: "oi pastor", type: "text", timestamp: agora - 300, fromMe: false },
  { id: "a2", chatId: "111@lid", from: "111@lid", body: "", type: "image", timestamp: agora - 290, fromMe: false },
  { id: "a3", chatId: "111@lid", from: "111@lid", body: "respondendo", type: "text", timestamp: agora - 280, fromMe: false,
    quotedMessage: { id: "a1", body: "oi pastor" } },
]);
caixa.mensagens.set("222@lid", [
  { id: "b1", chatId: "222@lid", from: "222@lid", body: "bom dia", type: "text", timestamp: agora - 200, fromMe: false },
]);
caixa.mensagens.set("120363@g.us", [
  { id: "g1", chatId: "120363@g.us", from: "120363@g.us", author: "444@lid", body: "ensaio às 19h", type: "text",
    timestamp: agora - 250, fromMe: false, isGroup: true, contact: { pushName: "Irmão João" } },
]);

console.log("\n== @lid: sem isto, a caixa inteira aparece sem nome ==");
r = await call("GET", "/api/whatsapp/conversas", { cookie: A });
const porChat = Object.fromEntries(r.d.records.map((c) => [c.chatId, c]));
ok(porChat["111@lid"].phone === "5511988881111", "o @lid foi resolvido para telefone", porChat["111@lid"]?.phone);
ok(porChat["111@lid"].name === "Maria Membro", "e a conversa casou com a ficha -- é o nome DELA que aparece", porChat["111@lid"]?.name);
ok(porChat["222@lid"].phone === "5511977772222" && porChat["222@lid"].naoIdentificado === true,
   "telefone resolvido mas ninguém cadastrado: continua não identificado, sem inventar pessoa",
   JSON.stringify([porChat["222@lid"]?.phone, porChat["222@lid"]?.naoIdentificado]));
ok(porChat["333@lid"].phone === null, "o que o motor não mapeia fica sem telefone -- caso normal, não erro", porChat["333@lid"]?.phone);

console.log("\n== e a resolução não vira consulta de rede eterna ==");
const depoisDaPrimeira = chamadas.resolverTelefone;
await call("GET", "/api/whatsapp/conversas", { cookie: A });
await call("GET", "/api/whatsapp/conversas", { cookie: A });
ok(chamadas.resolverTelefone === depoisDaPrimeira,
   "abrir a caixa mais duas vezes NÃO repete a consulta -- nem para quem resolveu, nem para quem nunca resolve",
   `${depoisDaPrimeira} -> ${chamadas.resolverTelefone}`);
const grupoConsultado = (await sql.query("SELECT phone_lookup_at FROM whatsapp_conversations WHERE chat_id = '120363@g.us'")).rows[0];
ok(grupoConsultado.phone_lookup_at === null, "grupo nunca é consultado: grupo não tem telefone", String(grupoConsultado?.phone_lookup_at));

console.log("\n== GRUPO: desenhado e defendido, mas NUNCA medido contra um grupo real ==");
r = await call("GET", "/api/whatsapp/conversas", { cookie: A });
const idGrupo = r.d.records.find((c) => c.chatId === "120363@g.us").id;
ok(r.d.records.find((c) => c.id === idGrupo).kind === "group", "entra como grupo", "");
r = await call("GET", `/api/whatsapp/conversas/${idGrupo}`, { cookie: A });
ok(r.s === 200 && r.d.messages.length === 1, "abrir um grupo não quebra", `${r.s} ${r.d?.messages?.length}`);
ok(r.d.messages[0].author === "444@lid", "quem falou vem em author -- em grupo, `from` é o grupo", r.d.messages[0]?.author);
ok(r.d.messages[0].authorName === "Irmão João", "e com NOME, senão o grupo vira balão sem dono", r.d.messages[0]?.authorName);

console.log("\n== hasMedia sai do TIPO, nunca da presença dos bytes ==");
r = await call("GET", "/api/whatsapp/conversas", { cookie: A });
const idMaria = r.d.records.find((c) => c.chatId === "111@lid").id;
const idOutra = r.d.records.find((c) => c.chatId === "222@lid").id;
r = await call("GET", `/api/whatsapp/conversas/${idMaria}`, { cookie: A });
const foto = r.d.messages.find((m) => m.waMessageId === "a2");
// O stub NÃO devolve `media` no histórico, como o OpenWA de verdade sem
// includeMedia. Um hasMedia deduzido dos bytes nasceria false aqui -- e no ar
// nasceria false para toda foto acima de 1 MB, que é quase toda foto.
ok(foto.hasMedia === true, "foto sem bytes inline continua sendo foto", String(foto?.hasMedia));
ok(foto.media?.kind === "image", "e o tipo de mídia vem junto", foto.media?.kind);
ok(foto.media?.url === `/api/whatsapp/conversas/${idMaria}/midia/a2`,
   "a URL da mídia é do NONIA -- a chave do OpenWA nunca chega ao navegador", foto.media?.url);
ok(r.d.messages.find((m) => m.waMessageId === "a1").media === null, "e texto não ganha URL de mídia", "");

console.log("\n== a MESMA mensagem não pode ter dois textos ==");
// A última da conversa da Maria é a foto `a2`, sem legenda. Na lista isso vinha
// do `lastMessage` cru do chat e chegava EM BRANCO; dentro da conversa vinha do
// previa() e chegava "[foto]". Mesma mensagem, dois textos.
caixa.mensagens.get("111@lid").push(
  { id: "a4", chatId: "111@lid", from: "111@lid", body: "", type: "image", timestamp: agora - 270, fromMe: false });
caixa.chats[0].lastMessage = "";   // é o que o WhatsApp devolve para mídia
r = await call("GET", `/api/whatsapp/conversas/${idMaria}`, { cookie: A });
const dentro = r.d.messages.at(-1).preview;
r = await call("GET", "/api/whatsapp/conversas", { cookie: A });
const naLista = r.d.records.find((c) => c.chatId === "111@lid").preview;
ok(naLista === "[foto]", "foto como última mensagem aparece [foto] NA LISTA, não em branco", JSON.stringify(naLista));
ok(naLista === dentro, "e é o MESMO texto de dentro da conversa -- uma função só", `${JSON.stringify(naLista)} vs ${JSON.stringify(dentro)}`);
// O CASO REAL, e nao uma aproximacao dele: na conta do Lucas o chat
// "WhatsApp Business" (0@c.us) tem UMA mensagem, tipo `unknown`, com 78.336
// caracteres de base64 de um JPEG no `body` -- da para ler o EXIF do Photoshop
// la dentro. O comeco abaixo e o comeco real dele.
const CARGA_REAL = "/9j/4R5XRXhpZgAATU0AKgAAAAgABwESAAMAAAABAAEAAAEaAAUAAAABAAAA" + "A".repeat(78000);
caixa.chats[1].lastMessage = CARGA_REAL;
caixa.mensagens.get("222@lid").push(
  { id: "b9", chatId: "222@lid", from: "222@lid", body: CARGA_REAL, type: "unknown", timestamp: agora - 100, fromMe: false });
await call("GET", `/api/whatsapp/conversas/${idOutra}`, { cookie: A });
r = await call("GET", "/api/whatsapp/conversas", { cookie: A });
const gigante = r.d.records.find((c) => c.chatId === "222@lid").preview;
ok(gigante === "[mensagem nao suportada]".replace("nao", "não"),
   "tipo `unknown`: o marcador vai SOZINHO -- em `unknown` o corpo e a carga, nao legenda", JSON.stringify(gigante.slice(0, 60)));
r = await call("GET", `/api/whatsapp/conversas/${idOutra}`, { cookie: A });
ok(r.d.messages.find((m) => m.waMessageId === "b9")?.preview === "[mensagem não suportada]",
   "e vale igual DENTRO da conversa, porque e uma funcao so",
   JSON.stringify(r.d.messages.find((m) => m.waMessageId === "b9")?.preview?.slice(0, 60)));
// Os outros tipos cujo corpo o whatsapp-web.js tira de `data.body`, e nao de
// `caption`: vCard inteiro, log de chamada, apagada, protegida.
for (const [tipo, esperado] of [["contact", "[contato]"], ["call", "[chamada]"],
                                ["revoked", "[mensagem apagada]"], ["masked", "[mensagem protegida]"]]) {
  caixa.mensagens.get("222@lid").push({ id: `c-${tipo}`, chatId: "222@lid", from: "222@lid",
    body: "BEGIN:VCARD\nFN:Fulano\nTEL:+5511999999999\nEND:VCARD", type: tipo, timestamp: agora - 90, fromMe: false });
  r = await call("GET", `/api/whatsapp/conversas/${idOutra}`, { cookie: A });
  // Procurada pelo id, e nao com at(-1): as quatro tem o mesmo instante, e a
  // ordem entre elas e por uuid -- arbitraria.
  const achada = r.d.messages.find((m) => m.waMessageId === `c-${tipo}`);
  ok(achada?.preview === esperado,
     `${tipo}: marcador sozinho, sem a carga colada no fim`, JSON.stringify(achada?.preview));
}
// E a legenda continua aparecendo onde legenda existe de verdade -- que e onde
// o whatsapp-web.js preenche `body` com `data.caption`: mensagem COM midia.
caixa.mensagens.get("222@lid").push({ id: "c-img", chatId: "222@lid", from: "222@lid",
  body: "olha o cartaz do culto", type: "image", timestamp: agora - 80, fromMe: false });
r = await call("GET", `/api/whatsapp/conversas/${idOutra}`, { cookie: A });
ok(r.d.messages.find((m) => m.waMessageId === "c-img")?.preview === "[foto] olha o cartaz do culto",
   "foto COM legenda continua mostrando as duas coisas -- o conserto nao comeu isso",
   JSON.stringify(r.d.messages.find((m) => m.waMessageId === "c-img")?.preview));

console.log("\n== AVISO DO WHATSAPP NAO E MENSAGEM DE GENTE ==");
// Medido na conta real: das 2.300 mensagens, 224 sao `unknown` -- e um grupo
// tinha 155 de 155. TODA `unknown` de grupo veio com o corpo VAZIO. Aqui vao as
// duas: a sem corpo (ruido) e a com corpo (conteudo que nao sabemos abrir).
caixa.mensagens.get("111@lid").push(
  { id: "s1", chatId: "111@lid", from: "111@lid", body: "", type: "unknown", timestamp: agora - 260, fromMe: false },
  { id: "s2", chatId: "111@lid", from: "111@lid", body: "", type: "unknown", timestamp: agora - 259, fromMe: false },
  { id: "s3", chatId: "111@lid", from: "111@lid", body: CARGA_REAL, type: "unknown", timestamp: agora - 258, fromMe: false });
r = await call("GET", `/api/whatsapp/conversas/${idMaria}`, { cookie: A });
ok(!r.d.messages.some((m) => ["s1", "s2"].includes(m.waMessageId)),
   "unknown SEM corpo nao aparece na conversa -- linha sem conteudo nenhum", "");
ok(r.d.avisosIgnorados === 2,
   "mas a conversa DIZ quantas foram omitidas -- conversa que encolhe sem explicacao mente", r.d?.avisosIgnorados);
ok(r.d.messages.find((m) => m.waMessageId === "s3")?.preview === "[mensagem não suportada]",
   "unknown COM corpo continua aparecendo: ali ha conteudo, so nao sabemos abrir", "");
const guardado = (await sql.query(
  "SELECT type FROM whatsapp_messages WHERE wa_message_id = 's1' AND organization_id = $1", [orgA])).rows[0];
ok(guardado?.type === "system", "e ela continua GRAVADA: some da lista, nao do banco", guardado?.type);
r = await call("GET", "/api/whatsapp/conversas", { cookie: A });
ok(r.d.records.find((c) => c.chatId === "111@lid").preview !== "[aviso do WhatsApp]",
   "e a previa da lista nao vira aviso quando a ultima fala foi de gente",
   r.d.records.find((c) => c.chatId === "111@lid")?.preview);

console.log("\n== o contrato não pode ter dois nomes para o mesmo campo ==");
r = await call("GET", `/api/whatsapp/conversas/${idMaria}`, { cookie: A });
const chavesDaMensagem = Object.keys(r.d.messages[0]).sort();
const cruas = ["mediaMimetype", "mediaFilename", "quotedWaMessageId", "quotedType", "quotedBody"];
ok(cruas.every((k) => !(k in r.d.messages[0])),
   "as colunas cruas do JOIN não vazam junto com media{} e quoted{}", chavesDaMensagem.join(","));
ok(JSON.stringify(chavesDaMensagem) === JSON.stringify(
     ["author","authorName","body","fromMe","hasMedia","id","media","preview","quoted","sentAt","type","waMessageId"]),
   "e a mensagem tem EXATAMENTE os campos do contrato, nem mais nem menos", chavesDaMensagem.join(","));

console.log("\n== a citação que veio do WhatsApp ==");
const citando = r.d.messages.find((m) => m.waMessageId === "a3");
ok(citando.quoted?.waMessageId === "a1", "a mensagem citada é identificada", citando.quoted?.waMessageId);
ok(citando.quoted?.preview === "oi pastor", "e o texto dela vem da PRÓPRIA tabela, não de uma cópia", citando.quoted?.preview);

console.log("\n== responder citando ==");
let antes = enviadas.length;
r = await call("POST", `/api/whatsapp/conversas/${idMaria}`, { cookie: A, body: { message: "sobre isso:", quotedWaMessageId: "a1" } });
ok(r.s === 201, "aceita", `${r.s} ${r.d?.code}`);
ok(enviadas.at(-1).quotedMessageId === "a1", "e o id da citada chega ao OpenWA com o nome certo (quotedMessageId)", JSON.stringify(enviadas.at(-1)));
r = await call("POST", `/api/whatsapp/conversas/${idMaria}`, { cookie: A, body: { message: "x", quotedWaMessageId: "b1" } });
ok(r.s === 404 && r.d.code === "quoted_not_found",
   "citar mensagem de OUTRA conversa -> 404: o balão enviado mostraria o texto dela", `${r.s} ${r.d?.code}`);

console.log("\n== encaminhar ==");
antes = enviadas.length;
r = await call("POST", `/api/whatsapp/conversas/${idMaria}/encaminhar`, { cookie: A, body: { waMessageId: "a1", paraConversaId: idOutra } });
ok(r.s === 201 && r.d.conversationId === idOutra, "encaminha para outra conversa", `${r.s} ${r.d?.code}`);
ok(enviadas.at(-1).forward === true && enviadas.at(-1).fromChatId === "111@lid" && enviadas.at(-1).toChatId === "222@lid",
   "com fromChatId, toChatId e messageId -- os três nomes do DTO", JSON.stringify(enviadas.at(-1)));
r = await call("GET", `/api/whatsapp/conversas/${idOutra}`, { cookie: A });
ok(r.d.messages.some((m) => m.fromMe && m.preview === "[mensagem encaminhada]"),
   "e a linha nasce na conversa de DESTINO, dizendo o que é em vez de linha vazia", "");
r = await call("POST", `/api/whatsapp/conversas/${idMaria}/encaminhar`, { cookie: A, body: { waMessageId: "a1" } });
ok(r.s === 400 && r.d.code === "forward_target_required", "sem destino -> 400", `${r.s} ${r.d?.code}`);
r = await call("POST", `/api/whatsapp/conversas/${idMaria}/encaminhar`, { cookie: A, body: { waMessageId: "b1", paraConversaId: idOutra } });
ok(r.s === 404, "encaminhar mensagem que não é desta conversa -> 404", `${r.s} ${r.d?.code}`);

const membros = (await call("GET", "/api/members?pageSize=10", { cookie: A })).d.records;
const zeca = membros.find((m) => m.name.startsWith("Zeca"));
r = await call("POST", `/api/whatsapp/conversas/${idMaria}/encaminhar`, { cookie: A, body: { waMessageId: "a1", paraPersonId: zeca.id } });
ok(r.s === 409 && r.d.code === "person_without_phone", "pessoa sem telefone -> 409 com motivo, não 500", `${r.s} ${r.d?.code}`);
const maria = membros.find((m) => m.name.startsWith("Maria"));
r = await call("POST", `/api/whatsapp/conversas/${idMaria}/encaminhar`, { cookie: A, body: { waMessageId: "a1", paraPersonId: maria.id } });
ok(r.s === 201, "encaminhar para pessoa do cadastro funciona", `${r.s} ${r.d?.code}`);
ok(enviadas.at(-1).toChatId === "5511988881111@c.us",
   "e o chatId sai da MESMA função do envio em massa, não de uma segunda regra", enviadas.at(-1)?.toChatId);

console.log("\n== enviar mídia ==");
const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
r = await enviarArquivo(`/api/whatsapp/conversas/${idMaria}/midia`, A, { bytes: png, nome: "foto.png", tipo: "image/png", caption: "olha" });
ok(r.s === 201 && r.d.type === "image", "imagem -> send-image", `${r.s} ${r.d?.code}`);
ok(enviadas.at(-1).tipo === "image" && enviadas.at(-1).mimetype === "image/png" && Boolean(enviadas.at(-1).base64),
   "chega como base64 + mimetype, os nomes do SendMediaMessageDto", JSON.stringify(Object.keys(enviadas.at(-1))));
const waFoto = r.d.waMessageId;
r = await call("GET", `/api/whatsapp/conversas/${idMaria}`, { cookie: A });
const enviadaFoto = r.d.messages.find((m) => m.waMessageId === waFoto);
ok(enviadaFoto.preview === "[foto] olha", "e a que a igreja enviou também vira marcador, não linha vazia", enviadaFoto?.preview);
ok(enviadaFoto.media?.filename === "foto.png", "com o nome do arquivo, que a gente conhece porque passou por aqui", enviadaFoto.media?.filename);

r = await enviarArquivo(`/api/whatsapp/conversas/${idMaria}/midia`, A, { bytes: png, nome: "voz.ogg", tipo: "audio/ogg", voz: true });
ok(r.s === 201 && r.d.type === "voice", "áudio com voz=true vira nota de voz", `${r.s} ${r.d?.type}`);
ok(enviadas.at(-1).ptt === true, "e o ptt=true chega ao OpenWA", String(enviadas.at(-1)?.ptt));
r = await enviarArquivo(`/api/whatsapp/conversas/${idMaria}/midia`, A, { bytes: png, nome: "doc.pdf", tipo: "application/pdf" });
ok(r.s === 201 && r.d.type === "document", "pdf -> send-document", `${r.s} ${r.d?.type}`);
r = await enviarArquivo(`/api/whatsapp/conversas/${idMaria}/midia`, A, { bytes: png, nome: "x.bin", tipo: "application/octet-stream" });
ok(r.s === 415 && r.d.code === "midia_nao_suportada", "tipo irreconhecível -> 415, em vez de mandar um balão quebrado", `${r.s} ${r.d?.code}`);
r = await enviarArquivo(`/api/whatsapp/conversas/${idMaria}/midia`, A, { bytes: Buffer.alloc(17 * 1024 * 1024), nome: "g.png", tipo: "image/png" });
ok(r.s === 413 && r.d.code === "midia_grande", "acima de 16 MiB -> 413 antes de subir para o OpenWA", `${r.s} ${r.d?.code}`);

console.log("\n== baixar mídia: pelo nonia, com o cookie do nonia ==");
r = await baixar(`/api/whatsapp/conversas/${idMaria}/midia/${waFoto}`, A);
ok(r.s === 200 && r.ct === "image/png", "os bytes voltam com o tipo certo", `${r.s} ${r.ct}`);
ok(Buffer.compare(r.bytes, png) === 0, "e são OS MESMOS bytes que subiram", `${r.bytes?.length} vs ${png.length}`);
ok(/^inline/.test(r.cd || ""), "inline, para a foto aparecer no balão em vez de baixar", r.cd);
ok(r.nosniff === "nosniff", "com nosniff: o navegador não adivinha tipo", r.nosniff);
const b64 = (await sql.query("SELECT count(*)::int n FROM whatsapp_messages WHERE body ~ '^[A-Za-z0-9+/]{200,}'")).rows[0].n;
ok(midias.size > 0 && b64 === 0, "e NADA de base64 foi copiado para o nosso banco", `${b64} linhas`);
// A mesma regra da previa, um passo antes: o corpo de um tipo cuja carga nao e
// legenda NAO E GUARDADO. Sem isto, o JPEG de 78 KB do chat "WhatsApp Business"
// entrava inteiro em whatsapp_messages.body -- a midia entrando pela janela.
const maior = (await sql.query("SELECT coalesce(max(length(body)),0)::int n FROM whatsapp_messages")).rows[0].n;
ok(maior < 1000, "e nenhum corpo guardado passa de 1000 caracteres, com uma carga de 78 KB no caminho", `${maior} chars`);

console.log("\n== 404 de mídia antiga é caso NORMAL, e precisa ser legível ==");
r = await baixar(`/api/whatsapp/conversas/${idMaria}/midia/a2`, A);
ok(r.s === 404 && r.d?.code === "midia_indisponivel",
   "foto anterior ao gateway -> 404 com código próprio, não erro genérico", `${r.s} ${r.d?.code}`);
ok(/WhatsApp/.test(r.d?.error || ""), "e a mensagem diz de quem é a limitação", r.d?.error);

console.log("\n== isolamento ==");
r = await call("POST", "/api/auth/register", { body: { organizationName: `Esp B ${u}`, fullName: "Outro", email: `ob${u}@x.test`, password: "senha1234" } });
const B = r.c;
r = await baixar(`/api/whatsapp/conversas/${idMaria}/midia/${waFoto}`, B);
ok(r.s === 404, "a outra igreja não baixa a mídia desta -> 404, sem confirmar que existe", r.s);
r = await call("POST", `/api/whatsapp/conversas/${idMaria}/encaminhar`, { cookie: B, body: { waMessageId: "a1", paraConversaId: idOutra } });
ok(r.s === 404, "nem encaminha a partir dela", r.s);
r = await enviarArquivo(`/api/whatsapp/conversas/${idMaria}/midia`, B, { bytes: png, nome: "x.png", tipo: "image/png" });
ok(r.s === 404, "nem manda arquivo na conversa dela", r.s);

console.log("\n== permissões ==");
const lei = await call("POST", "/api/users", { cookie: A, body: { email: `l${u}@x.test`, fullName: "Leitura", roleSlug: "leitura" } });
const tk = lei.d.inviteUrl.split("/convite/")[1];
const cLei = (await call("POST", "/api/auth/invite/accept", { body: { token: tk, fullName: "Leitura", password: "senha1234" } })).c;
r = await baixar(`/api/whatsapp/conversas/${idMaria}/midia/${waFoto}`, cLei);
ok(r.s === 403, "papel Leitura não tem whatsapp.read -> 403 até para baixar mídia", r.s);
const sec = await call("POST", "/api/users", { cookie: A, body: { email: `s${u}@x.test`, fullName: "Sec", roleSlug: "secretaria" } });
const tk2 = sec.d.inviteUrl.split("/convite/")[1];
const cSec = (await call("POST", "/api/auth/invite/accept", { body: { token: tk2, fullName: "Sec", password: "senha1234" } })).c;
r = await call("POST", `/api/whatsapp/conversas/${idMaria}/encaminhar`, { cookie: cSec, body: { waMessageId: "a1", paraConversaId: idOutra } });
ok(r.s === 201 || r.s === 429, "a secretaria encaminha (whatsapp.write) -- é ela quem atende", `${r.s} ${r.d?.code}`);

await sql.end(); servidor.close();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
