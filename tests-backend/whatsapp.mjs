// Blocos 1 (conexão) e 2 (envio em massa) do WhatsApp.
import pg from "/home/lucas/www/nonia-auth/node_modules/pg/lib/index.js";
import { iniciarOpenWaFalso, conectarSessao, chaveDe, controle, ADMIN_KEY } from "./openwa-falso.mjs";

const BASE = "http://127.0.0.1:3210";
const DB = "postgresql://nonia:nonia@127.0.0.1:54329/nonia";
const OPENWA = "http://127.0.0.1:2786";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
async function call(m, p, { body, cookie } = {}) {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null, c: r.headers.get("set-cookie")?.split(";")[0] };
}
const servidor = await iniciarOpenWaFalso(2786);
const sql = new pg.Client({ connectionString: DB }); await sql.connect();
await sql.query("SET TIME ZONE 'UTC'");
const u = Date.now().toString(36);

let r = await call("POST", "/api/auth/register", { body: { organizationName: `WA ${u}`, fullName: "Dona", email: `d${u}@x.test`, password: "senha1234" } });
const A = r.c, orgA = r.d.organization.id;
ok(r.s === 201, "igreja A cadastrada", r.s);
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });

console.log("\n== bloco 1: conectar ==");
r = await call("GET", "/api/whatsapp", { cookie: A });
ok(r.s === 200 && r.d.connected === false && r.d.status === "not_connected", "antes de conectar: não conectado, sem estourar", JSON.stringify(r.d));
r = await call("POST", "/api/whatsapp/connect", { cookie: A });
const sessaoA = r.d?.sessionId;
ok(r.s === 201 && Boolean(sessaoA), "sessão criada para a igreja A", `${r.s} ${JSON.stringify(r.d)}`);
r = await call("POST", "/api/whatsapp/connect", { cookie: A });
ok(r.s === 409 && r.d.code === "whatsapp_already_connected", "conectar de novo -> 409, não uma segunda sessão", `${r.s} ${r.d?.code}`);
r = await call("GET", "/api/whatsapp/connect", { cookie: A });
ok(r.s === 200 && r.d.qr === "QR-DE-TESTE" && r.d.connected === false, "o QR vem para a igreja ler", JSON.stringify(r.d));

console.log("\n== a chave fica CIFRADA no banco ==");
const linha = (await sql.query("SELECT session_id, api_key_encrypted, api_key_prefix FROM organization_whatsapp WHERE organization_id=$1", [orgA])).rows[0];
const chaveCrua = chaveDe(sessaoA);
ok(Boolean(chaveCrua), "a chave existe do lado do OpenWA");
ok(!linha.api_key_encrypted.includes(chaveCrua), "e NÃO aparece em claro no banco", linha.api_key_encrypted.slice(0, 24));
ok(linha.api_key_encrypted.startsWith("v1."), "está no formato cifrado versionado", linha.api_key_encrypted.slice(0, 3));

console.log("\n== isolamento, camada 1: o banco recusa sessão compartilhada ==");
r = await call("POST", "/api/auth/register", { body: { organizationName: `WB ${u}`, fullName: "Outro", email: `o${u}@x.test`, password: "senha1234" } });
const B = r.c, orgB = r.d.organization.id;
let erro = null;
try {
  await sql.query("INSERT INTO organization_whatsapp (organization_id, session_id, session_name, api_key_encrypted) VALUES ($1,$2,$3,$4)",
    [orgB, sessaoA, "roubada", "v1.x.y.z"]);
} catch (e) { erro = e.code; }
ok(erro === "23505", "duas igrejas na MESMA sessão -> recusado pelo UNIQUE (23505)", erro);

console.log("\n== isolamento, camada 2: o OpenWA recusa a chave de outra igreja ==");
await call("POST", "/api/whatsapp/connect", { cookie: B });
const sessaoB = (await sql.query("SELECT session_id FROM organization_whatsapp WHERE organization_id=$1", [orgB])).rows[0].session_id;
ok(sessaoB !== sessaoA, "a igreja B tem sessão PRÓPRIA", `${sessaoA} vs ${sessaoB}`);
const chaveA = chaveDe(sessaoA);
let resp = await fetch(`${OPENWA}/api/sessions/${sessaoB}`, { headers: { "x-api-key": chaveA } });
ok(resp.status === 403, "chave da A apontada para a sessão da B -> 403 NO OUTRO LADO", resp.status);
resp = await fetch(`${OPENWA}/api/sessions/${sessaoA}`, { headers: { "x-api-key": chaveA } });
ok(resp.status === 200, "e na própria sessão continua funcionando", resp.status);
resp = await fetch(`${OPENWA}/api/sessions/${sessaoB}/messages/send-bulk`, {
  method: "POST", headers: { "content-type": "application/json", "x-api-key": chaveA },
  body: JSON.stringify({ messages: [{ chatId: "5511999999999@c.us", type: "text", content: { text: "oi" } }] }) });
ok(resp.status === 403, "e ENVIAR pela sessão da outra igreja também é recusado lá", resp.status);

console.log("\n== bloco 2: a conferência de ANTES ==");
const pessoas = [
  ["Com Fone Um", "(11) 98888-0001"], ["Com Fone Dois", "11988880002"], ["Com Fone Tres", "+55 11 98888-0003"],
  ["Sem Fone Um", ""], ["Sem Fone Dois", null], ["Fone Impossivel", "123"],
];
for (const [nome, fone] of pessoas) {
  const res = await call("POST", "/api/members", { cookie: A, body: { name: nome, email: `${nome.replace(/ /g, "").toLowerCase()}${u}@x.test`, phone: fone } });
  ok(res.s === 201, `cadastrado ${nome}`, res.s);
}
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", preview: true } });
ok(r.s === 200 && r.d.preview.total === 6, "a conferência vê os 6 selecionados", JSON.stringify(r.d.preview));
ok(r.d.preview.comTelefone === 3, "e diz que 3 têm telefone", r.d.preview?.comTelefone);
ok(r.d.preview.semTelefone === 3, "e 3 NÃO têm -- inclusive o número impossível", r.d.preview?.semTelefone);
ok(r.d.preview.estimativaSegundos === 12, "e a DURAÇÃO estimada, que é o que falta em '3 pessoas'", r.d.preview?.estimativaSegundos);
ok(r.d.preview.teto === 500, "o teto é 500 pessoas", r.d.preview?.teto);
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", preview: true, filters: { search: "Sem Fone" } } });
ok(r.d.preview.total === 2 && r.d.preview.comTelefone === 0, "a conferência SEGUE o filtro da tela", JSON.stringify(r.d.preview));

console.log("\n== enviar com o WhatsApp desconectado ==");
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", message: "Culto domingo!" } });
const envioId = r.d?.id;
ok(r.s === 201, "o envio é CRIADO (a conexão existe, mesmo sem estar pronta)", `${r.s} ${r.d?.code}`);
r = await call("GET", `/api/whatsapp/broadcasts/${envioId}`, { cookie: A });
ok(r.s === 200 && r.d.sentCount === 0 && r.d.status !== "done", "e não sai nada enquanto a sessão não está pronta", JSON.stringify([r.d.status, r.d.sentCount]));
ok(r.d.skippedCount === 3, "os 3 sem telefone já entram como pulados, não como falha", r.d?.skippedCount);
ok(r.d.recipients.length === 6, "e TODOS os 6 aparecem na lista, com nome", r.d?.recipients?.length);

console.log("\n== com a sessão pronta, o envio anda ==");
conectarSessao();
r = await call("GET", "/api/whatsapp", { cookie: A });
ok(r.s === 200 && r.d.connected === true && r.d.phone === "5511999990000", "a tela mostra conectado e o número", JSON.stringify([r.d.connected, r.d.phone]));
r = await call("GET", `/api/whatsapp/broadcasts/${envioId}`, { cookie: A });   // 1a leitura: despacha
r = await call("GET", `/api/whatsapp/broadcasts/${envioId}`, { cookie: A });   // 2a leitura: reconcilia
ok(r.d.sentCount === 3, "3 entregues", r.d?.sentCount);
ok(r.d.status === "done" && r.d.pendingCount === 0, "e o envio fecha sozinho na leitura, sem tarefa agendada", JSON.stringify([r.d.status, r.d.pendingCount]));
const enviados = r.d.recipients.filter((x) => x.status === "sent");
ok(enviados.every((x) => x.sentAt), "cada entregue tem a hora", "");

console.log("\n== falha parcial: 'deu erro' é proibido ==");
controle.falharChatIds.add("5511977770002@c.us");
for (const [nome, fone] of [["Falha Um", "11977770001"], ["Falha Dois", "11977770002"], ["Falha Tres", "11977770003"]]) {
  await call("POST", "/api/members", { cookie: A, body: { name: nome, email: `${nome.replace(/ /g, "").toLowerCase()}${u}@x.test`, phone: fone } });
}
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", message: "Aviso", filters: { search: "Falha" } } });
const envio2 = r.d.id;
await call("GET", `/api/whatsapp/broadcasts/${envio2}`, { cookie: A });
r = await call("GET", `/api/whatsapp/broadcasts/${envio2}`, { cookie: A });
ok(r.d.sentCount === 2 && r.d.failedCount === 1, "2 entregues e 1 falhou -- números separados", JSON.stringify([r.d.sentCount, r.d.failedCount]));
const falhou = r.d.recipients.find((x) => x.status === "failed");
ok(falhou?.name === "Falha Dois", "a tela sabe QUEM não recebeu, pelo nome", falhou?.name);
ok(falhou?.errorCode === "RECIPIENT_UNREACHABLE", "e por quê", falhou?.errorCode);
ok(r.d.recipients[0].status === "failed", "a falha vem PRIMEIRO na lista: é sobre ela que há o que fazer", r.d.recipients[0]?.status);
ok(r.d.status === "done", "e o envio termina mesmo com falha no meio -- stopOnError é false", r.d?.status);

console.log("\n== não manda duas vezes ==");
const antes = r.d.sentCount;
for (let i = 0; i < 3; i++) await call("GET", `/api/whatsapp/broadcasts/${envio2}`, { cookie: A });
r = await call("GET", `/api/whatsapp/broadcasts/${envio2}`, { cookie: A });
ok(r.d.sentCount === antes, "reler quatro vezes não reenvia nada", `${antes} -> ${r.d.sentCount}`);

console.log("\n== isolamento do envio entre igrejas ==");
r = await call("GET", `/api/whatsapp/broadcasts/${envio2}`, { cookie: B });
ok(r.s === 404, "a igreja B não vê o envio da A -> 404, sem confirmar que existe", r.s);
r = await call("POST", `/api/whatsapp/broadcasts/${envio2}`, { cookie: B });
ok(r.s === 404, "nem consegue cancelar", r.s);
r = await call("GET", "/api/whatsapp/broadcasts", { cookie: B });
ok(r.d.total === 0, "e a lista dela está vazia", r.d?.total);

console.log("\n== permissões: broadcast é separada de write ==");
const conv = await call("POST", "/api/users", { cookie: A, body: { email: `sec${u}@x.test`, fullName: "Secretaria", roleSlug: "secretaria" } });
const token = conv.d.inviteUrl.split("/convite/")[1];
const sec = (await call("POST", "/api/auth/invite/accept", { body: { token, fullName: "Secretaria", password: "senha1234" } })).c;
r = await call("GET", "/api/whatsapp", { cookie: sec });
ok(r.s === 200, "a secretaria VÊ a conexão (whatsapp.read)", r.s);
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: sec, body: { audience: "members", message: "oi" } });
ok(r.s === 403 && r.d.code === "missing_permission", "mas NÃO dispara em massa -> 403 (whatsapp.broadcast é só de owner e admin)", `${r.s} ${r.d?.code}`);
r = await call("GET", "/api/whatsapp/broadcasts", { cookie: sec });
ok(r.s === 200, "e continua vendo o histórico do que foi enviado", r.s);

console.log("\n== somente leitura barra o disparo ==");
await sql.query("UPDATE subscriptions SET status='past_due', current_period_end=(now() - interval '30 days') WHERE organization_id=$1", [orgA]);
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", message: "oi" } });
ok(r.s === 402 && r.d.code === "subscription_read_only",
   "igreja em atraso NÃO dispara para 500 pessoas -> 402", `${r.s} ${r.d?.code}`);
r = await call("GET", "/api/whatsapp/broadcasts", { cookie: A });
ok(r.s === 200, "mas continua CONSULTANDO o histórico -- consultar nunca é tirado", r.s);
await sql.query("UPDATE subscriptions SET status='active', current_period_end=(now() + interval '30 days') WHERE organization_id=$1", [orgA]);

console.log("\n== mensagem e público ==");
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", message: "   " } });
ok(r.s === 400 && r.d.code === "message_required", "mensagem vazia -> 400 com motivo", `${r.s} ${r.d?.code}`);
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", message: "x".repeat(4097) } });
ok(r.s === 400 && r.d.code === "message_too_long", "acima de 4096 -> 400 dizendo o limite do WhatsApp", `${r.s} ${r.d?.code}`);
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "celulas", message: "oi" } });
ok(r.s === 400 && r.d.code === "invalid_audience", "público inválido -> 400", `${r.s} ${r.d?.code}`);
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", message: "oi", filters: { search: "Sem Fone" } } });
ok(r.s === 400 && r.d.code === "no_recipients", "ninguém com telefone -> 400 explicando, não um envio vazio", `${r.s} ${r.d?.code}`);

console.log("\n== o histórico registra ==");
r = await call("GET", "/api/activities", { cookie: A });
ok(r.d.records.some((x) => /WhatsApp/i.test(x.action || "")), "o disparo aparece nas atividades", r.d.records[0]?.action);

console.log("\n== desconectar ==");
r = await call("DELETE", "/api/whatsapp", { cookie: A });
ok(r.s === 200, "desconectou", r.s);
ok((await sql.query("SELECT count(*)::int n FROM organization_whatsapp WHERE organization_id=$1", [orgA])).rows[0].n === 0, "a linha saiu do banco");
resp = await fetch(`${OPENWA}/api/sessions/${sessaoA}`, { headers: { "x-api-key": ADMIN_KEY } });
ok(resp.status === 404, "e a sessão foi apagada no OpenWA -- não fica órfã", resp.status);
r = await call("GET", "/api/whatsapp/broadcasts", { cookie: A });
ok(r.s === 200 && r.d.total >= 2, "mas o HISTÓRICO do que foi enviado permanece", r.d?.total);

await sql.end(); servidor.close();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
