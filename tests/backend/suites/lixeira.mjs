import { createRequire } from "node:module";
const require2 = createRequire("/home/lucas/www/nonia-auth/package.json");
const { Client } = require2("pg");
const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
const ANEXO = "data:application/pdf;base64,JVBERi0xLjQKSEVMTE8=";
async function call(m, p, { body, cookie } = {}) {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || ""; const txt = await r.text();
  return { s: r.status, txt, d: ct.includes("json") ? JSON.parse(txt || "null") : null, c: r.headers.get("set-cookie")?.split(";")[0] };
}
const db = new Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/nonia" }); await db.connect();
const u = Date.now().toString(36);
let r = await call("POST", "/api/auth/register", { body: { organizationName: `Lixo ${u}`, fullName: "Pastor", email: `p${u}@x.test`, password: "senha1234" } });
const A = r.c;
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });
await call("POST", "/api/users", { cookie: A, body: { email: `sec${u}@x.test`, fullName: "Marta Secretaria", roleSlug: "secretaria", password: "senha1234" } });
const S = (await call("POST", "/api/auth/login", { body: { email: `sec${u}@x.test`, password: "senha1234" } })).c;

r = await call("POST", "/api/financeiro", { cookie: A, body: { type: "income", description: "Dízimos de setembro", category: "Dízimos", amount: "18500.00", status: "paid", transactionDate: "2026-09-06", attachmentUrl: ANEXO, attachmentName: "comprovante.pdf" } });
const lanc = r.d.id;
await call("POST", "/api/financeiro", { cookie: A, body: { type: "expense", description: "Aluguel", category: "Aluguel", amount: "3800.00", status: "paid", transactionDate: "2026-09-01" } });

console.log("== a secretaria exclui, e o dado NÃO some ==");
r = await call("DELETE", `/api/financeiro/${lanc}`, { cookie: S });
ok(r.s === 200, "secretaria exclui o lançamento", r.s);
const linha = (await db.query("SELECT deleted_at IS NOT NULL AS marcado, deleted_by IS NOT NULL AS tem_autor FROM financial_transactions WHERE id = $1", [lanc])).rows[0];
ok(linha !== undefined, "a LINHA continua no banco -- não foi removida");
ok(linha.marcado && linha.tem_autor, "marcada com quem excluiu", JSON.stringify(linha));

console.log("\n== e some de tudo que é leitura normal ==");
r = await call("GET", "/api/financeiro", { cookie: A });
ok(r.d.total === 1 && r.d.records[0].description === "Aluguel", "listagem não traz o excluído", r.d.total);
r = await call("GET", `/api/financeiro/${lanc}`, { cookie: A });
ok(r.s === 404, "GET por id -> 404", r.s);
r = await call("GET", "/api/export/financeiro", { cookie: A });
ok(!/Dízimos de setembro/.test(r.txt) && /Aluguel/.test(r.txt), "o CSV não leva o excluído");
r = await call("PUT", `/api/financeiro/${lanc}`, { cookie: A, body: { type: "income", description: "X", category: "Dízimos", amount: "1.00", transactionDate: "2026-09-06" } });
ok(r.s === 404, "e não dá para editar sem restaurar antes", r.s);

console.log("\n== O COMPROVANTE não vaza por nenhuma rota ==");
ok(!/JVBERi0xLjQ/.test((await call("GET", "/api/financeiro", { cookie: A })).txt), "listagem");
ok(!/JVBERi0xLjQ/.test((await call("GET", `/api/financeiro/${lanc}`, { cookie: A })).txt), "GET por id");
ok(!/JVBERi0xLjQ/.test((await call("GET", "/api/export/financeiro", { cookie: A })).txt), "exportação");
ok(!/JVBERi0xLjQ/.test((await call("GET", "/api/financeiro?deleted=1", { cookie: A })).txt), "e nem na própria lixeira");
ok(!/JVBERi0xLjQ/.test((await call("GET", "/api/dashboard", { cookie: A })).txt), "painel");
ok(!/JVBERi0xLjQ/.test((await call("GET", "/api/activities", { cookie: A })).txt), "histórico");

console.log("\n== a lixeira, que é o caminho de volta ==");
r = await call("GET", "/api/financeiro?deleted=1", { cookie: A });
ok(r.s === 200 && r.d.total === 1 && r.d.records[0].id === lanc, "a lixeira mostra o excluído", r.d?.total);
ok(Boolean(r.d.records[0].deletedAt), "com quando foi excluído", r.d.records[0]?.deletedAt);
ok(r.d.records[0].deletedByName === "Marta Secretaria", "e por quem", r.d.records[0]?.deletedByName);
ok(r.d.records[0].hasAttachment === true && r.d.records[0].attachmentName === "comprovante.pdf", "e diz que tinha comprovante, sem mandá-lo");

console.log("\n== restaurar ==");
r = await call("POST", `/api/financeiro/${lanc}/restore`, { cookie: A });
ok(r.s === 200, "restaurou", `${r.s} ${r.d?.code}`);
r = await call("GET", "/api/financeiro", { cookie: A });
ok(r.d.total === 2, "voltou para a listagem", r.d.total);
r = await call("GET", `/api/financeiro/${lanc}`, { cookie: A });
ok(r.d.attachmentUrl === ANEXO, "COM o comprovante intacto");
ok((await call("GET", "/api/financeiro?deleted=1", { cookie: A })).d.total === 0, "e saiu da lixeira");
r = await call("GET", "/api/activities", { cookie: A });
ok(/restaurou o lançamento/.test(r.d.records[0]?.action || ""), "o histórico registra quem restaurou", r.d.records[0]?.action);
ok(r.d.records[0]?.actor === "Pastor", "com o nome de quem fez", r.d.records[0]?.actor);
ok(r.d.records.some((x) => /excluiu o lançamento/.test(x.action)), "e o registro da exclusão continua lá");

console.log("\n== restaurar o que não está na lixeira ==");
ok((await call("POST", `/api/financeiro/${lanc}/restore`, { cookie: A })).s === 404, "lançamento ativo -> 404");
ok((await call("POST", `/api/financeiro/00000000-0000-0000-0000-000000000000/restore`, { cookie: A })).s === 404, "inexistente -> 404");
ok((await call("POST", `/api/financeiro/nao-e-uuid/restore`, { cookie: A })).s === 404, "id malformado -> 404, não 500");

console.log("\n== permissão e tenant ==");
await call("POST", "/api/users", { cookie: A, body: { email: `l${u}@x.test`, fullName: "Léo", roleSlug: "leitura", password: "senha1234" } });
const L = (await call("POST", "/api/auth/login", { body: { email: `l${u}@x.test`, password: "senha1234" } })).c;
ok((await call("GET", "/api/financeiro?deleted=1", { cookie: L })).s === 403, "'leitura' não vê a lixeira do financeiro");
ok((await call("POST", `/api/financeiro/${lanc}/restore`, { cookie: L })).s === 403, "nem restaura");
const outra = await call("POST", "/api/auth/register", { body: { organizationName: `Outra ${u}`, fullName: "O", email: `o${u}@x.test`, password: "senha1234" } });
await call("DELETE", `/api/financeiro/${lanc}`, { cookie: A });
ok((await call("GET", "/api/financeiro?deleted=1", { cookie: outra.c })).d.total === 0, "outra igreja não vê a lixeira desta");
ok((await call("POST", `/api/financeiro/${lanc}/restore`, { cookie: outra.c })).s === 404, "nem restaura o que não é dela");

console.log("\n== sessões vencidas são limpas no login ==");
await db.query(`INSERT INTO sessions (user_id, organization_id, token_hash, expires_at, revoked_at)
  SELECT v.user_id, v.organization_id, 'lixo-' || g, now() - interval '40 days', now() - interval '40 days'
  FROM (SELECT user_id, organization_id FROM organization_members LIMIT 1) v, generate_series(1,3) g`);
const antes = (await db.query("SELECT count(*)::int n FROM sessions WHERE token_hash LIKE 'lixo-%'")).rows[0].n;
ok(antes === 3, "3 sessões velhas plantadas", antes);
await call("POST", "/api/auth/login", { body: { email: `p${u}@x.test`, password: "senha1234" } });
await new Promise((r) => setTimeout(r, 800));
const depois = (await db.query("SELECT count(*)::int n FROM sessions WHERE token_hash LIKE 'lixo-%'")).rows[0].n;
ok(depois === 0, "e o login limpou as vencidas", `${depois} restantes`);

await db.end();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
