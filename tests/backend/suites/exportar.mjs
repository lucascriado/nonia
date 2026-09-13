import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("/home/lucas/www/nonia-auth/node_modules/pg");
const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
async function call(method, path, { body, cookie } = {}) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const tipo = res.headers.get("content-type") || "";
  const data = tipo.includes("json") ? await res.json().catch(() => null) : await res.text();
  return { status: res.status, data, headers: res.headers, cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
const db = new Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/nonia" }); await db.connect();
const u = Date.now().toString(36);

let r = await call("POST", "/api/auth/register", { body: { organizationName: `Igreja Alfa ${u}`, fullName: "Ana", email: `a${u}@a.test`, password: "senha1234" } });
const A = r.cookie, orgA = r.data.organization.id;
r = await call("POST", "/api/auth/register", { body: { organizationName: `Igreja Beta ${u}`, fullName: "Bruno", email: `b${u}@b.test`, password: "senha1234" } });
const B = r.cookie;

// dados em A, incluindo acento, ponto e virgula no meio do texto, e formula
await call("POST", "/api/members", { cookie: A, body: { name: "João Conceição", email: `joao${u}@x.test`, phone: "(11) 91234-5678", birthDate: "1990-03-07", cell: "Sem célula", notes: "Observação; com ponto e vírgula", status: "Ativo" } });
await call("POST", "/api/members", { cookie: A, body: { name: "=1+1", email: `formula${u}@x.test`, status: "Inativo" } });
await call("POST", "/api/visitors", { cookie: A, body: { name: "Márcia Souza", email: `marcia${u}@x.test`, invitedBy: "Pr. Anderson", membershipStage: "Contato realizado" } });
await call("POST", "/api/financeiro", { cookie: A, body: { type: "income", description: "Dízimos de setembro", category: "Dízimos", counterparty: "Congregação", amount: "18500.00", status: "paid", transactionDate: "2026-09-06", paymentMethod: "Pix" } });
await call("POST", "/api/financeiro", { cookie: A, body: { type: "expense", description: "Aluguel", category: "Aluguel", amount: "3800.50", status: "pending", transactionDate: "2026-09-01" } });
// dado em B, que NUNCA pode aparecer na exportacao de A
await call("POST", "/api/members", { cookie: B, body: { name: "SEGREDO DE BETA", email: `beta${u}@x.test` } });

console.log("\n== o arquivo abre no Excel brasileiro? ==");
r = await call("GET", "/api/export/members", { cookie: A });
ok(r.status === 200, "exportar membros -> 200", r.status);
ok(r.headers.get("content-type").startsWith("text/csv"), "content-type text/csv", r.headers.get("content-type"));
// fetch().text() REMOVE o BOM ao decodificar, por especificacao. So os bytes crus mostram.
const cru = Buffer.from(await (await fetch(BASE + "/api/export/members", { headers: { cookie: A } })).arrayBuffer());
ok(cru[0] === 0xef && cru[1] === 0xbb && cru[2] === 0xbf, "comeca com BOM UTF-8 (senao o Excel quebra o acento)",
   [...cru.subarray(0, 3)].map((b) => b.toString(16)).join(" "));
const linhas = r.data.replace(/^﻿/, "").split("\r\n").filter(Boolean);
ok(r.data.includes("\r\n"), "quebra de linha CRLF");
ok(linhas[0].split(";").length === 20, "cabecalho separado por PONTO E VIRGULA, 20 colunas", linhas[0].split(";").length);
ok(linhas[0].startsWith("Nome;E-mail;Telefone"), "cabecalho em portugues", linhas[0].slice(0, 40));
ok(/João Conceição/.test(r.data), "acento preservado no conteudo");

console.log("\n== formato brasileiro de data e valor ==");
ok(/07\/03\/1990/.test(r.data), "data como dd/mm/aaaa, sem escorregar um dia pelo fuso");
r = await call("GET", "/api/export/financeiro", { cookie: A });
ok(/18500,00/.test(r.data), "valor com virgula decimal", (r.data.match(/1850[^;]*/) || [])[0]);
ok(/06\/09\/2026/.test(r.data), "data do lancamento em dd/mm/aaaa");
ok(/Entrada;/.test(r.data) && /Saída;/.test(r.data), "tipo traduzido");
ok(/;Pago;/.test(r.data) && /;Pendente;/.test(r.data), "status traduzido");
ok(!/base64/.test(r.data), "o anexo base64 NAO vai junto");

console.log("\n== injecao de formula e ponto e virgula no texto ==");
r = await call("GET", "/api/export/members", { cookie: A });
ok(/'=1\+1/.test(r.data), "celula iniciada por = vira texto, nao formula", (r.data.match(/'?=1\+1/) || [])[0]);
ok(/"Observação; com ponto e vírgula"/.test(r.data), "texto com ponto e virgula vem entre aspas");

console.log("\n== nome do arquivo ==");
const cd = r.headers.get("content-disposition");
ok(/attachment/.test(cd), "e download, nao exibicao");
ok(/nonia-membros-igreja-alfa/.test(cd), "traz recurso e organizacao", cd);
ok(/\d{4}-\d{2}-\d{2}\.csv/.test(cd), "e a data");

console.log("\n== isolamento entre organizacoes ==");
ok(!/SEGREDO DE BETA/.test(r.data), "a exportacao de Alfa NAO traz dado de Beta");
r = await call("GET", "/api/export/members", { cookie: B });
ok(/SEGREDO DE BETA/.test(r.data) && !/João Conceição/.test(r.data), "e a de Beta so traz o de Beta");

console.log("\n== filtros espelham a tela ==");
r = await call("GET", "/api/export/members?status=Ativo", { cookie: A });
ok(/João/.test(r.data) && !/'=1\+1/.test(r.data), "status=Ativo (rotulo da tela) filtra");
r = await call("GET", "/api/export/members?status=inactive", { cookie: A });
ok(!/João/.test(r.data) && /'=1\+1/.test(r.data), "status=inactive (valor do banco) tambem filtra");
r = await call("GET", "/api/export/members?search=conceicao", { cookie: A });
ok(r.data.replace(/^﻿/, "").split("\r\n").filter(Boolean).length === 1, "busca sem acento nao acha (ILIKE e literal)", "esperado: so cabecalho");
r = await call("GET", "/api/export/members?search=Conceição", { cookie: A });
ok(/João/.test(r.data), "busca com acento acha");
r = await call("GET", "/api/export/financeiro?type=income", { cookie: A });
ok(/Dízimos de setembro/.test(r.data) && !/Aluguel/.test(r.data), "type=income filtra");
r = await call("GET", "/api/export/financeiro?attachment=with", { cookie: A });
ok(r.data.replace(/^﻿/, "").split("\r\n").filter(Boolean).length === 1, "attachment=with sem anexo -> so cabecalho");
r = await call("GET", "/api/export/visitors?tab=Recentes", { cookie: A });
ok(/Márcia/.test(r.data), "aba Recentes filtra");

console.log("\n== permissao ==");
await call("POST", "/api/users", { cookie: A, body: { email: `l${u}@a.test`, fullName: "Leo", roleSlug: "leitura", password: "senha1234" } });
const L = (await call("POST", "/api/auth/login", { body: { email: `l${u}@a.test`, password: "senha1234" } })).cookie;
ok((await call("GET", "/api/export/members", { cookie: L })).status === 200, "papel 'leitura' exporta membros");
ok((await call("GET", "/api/export/visitors", { cookie: L })).status === 200, "e visitantes");
r = await call("GET", "/api/export/financeiro", { cookie: L });
ok(r.status === 403, "mas NAO o financeiro, que ele nao ve na tela", r.status);
ok((await call("GET", "/api/export/members")).status === 401, "sem sessao -> 401");

console.log("\n== O PONTO INTEIRO: exportar em SOMENTE LEITURA ==");
await db.query(`UPDATE subscriptions SET status='past_due', plan_id=(SELECT id FROM plans WHERE slug='comunidade'),
                current_period_end=now()-interval '10 days' WHERE organization_id=$1`, [orgA]);
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.access.level === "read_only", "a igreja esta em somente leitura", r.data.plan?.access?.level);
ok((await call("POST", "/api/members", { cookie: A, body: { name: "X", email: `x${u}@x.test` } })).status === 402, "escrever e recusado");
for (const rec of ["members", "visitors", "financeiro"]) {
  const res = await call("GET", `/api/export/${rec}`, { cookie: A });
  ok(res.status === 200 && res.data.length > 100, `EXPORTAR ${rec} continua funcionando -- a igreja nao fica refem`, res.status);
}
r = await call("GET", "/api/export/members", { cookie: A });
ok(/João Conceição/.test(r.data), "e o arquivo vem completo, com os dados de verdade");

await db.end();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
