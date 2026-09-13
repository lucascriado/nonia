import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("/home/lucas/www/nonia-auth/node_modules/pg");
const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
async function call(method, path, { body, cookie } = {}) {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { status: r.status, data: ct.includes("json") ? await r.json().catch(() => null) : null, cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
const db = new Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/nonia" }); await db.connect();
const u = Date.now().toString(36);

let r = await call("POST", "/api/auth/register", { body: { organizationName: `Igreja ${u}`, fullName: "Ana", email: `a${u}@a.test`, password: "senha1234" } });
const A = r.cookie, org = r.data.organization.id;
await call("POST", "/api/members", { cookie: A, body: { name: "Membro Um", email: `m1${u}@x.test` } });
await call("POST", "/api/visitors", { cookie: A, body: { name: "Visita Um", email: `v1${u}@x.test` } });
await call("POST", "/api/cells", { cookie: A, body: { name: "Célula Um" } });
await call("POST", "/api/ministries", { cookie: A, body: { name: "Louvor" } });
const membro = (await call("GET", "/api/members", { cookie: A })).data.records[0].id;
const visita = (await call("GET", "/api/visitors", { cookie: A })).data.records[0].id;
const celula = (await call("GET", "/api/cells", { cookie: A })).data[0].id;
const min = (await call("GET", "/api/ministries", { cookie: A })).data.ministries[0].id;

await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });
await db.query(`UPDATE subscriptions SET status='past_due', current_period_end=now()-interval '10 days'
                WHERE organization_id=$1 AND status='active'`, [org]);
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.access.level === "read_only", "a igreja está em somente leitura", r.data.plan?.access?.level);

console.log("\n== (a) as duas ações que tiram a igreja de lá ==");
r = await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });
ok(r.status === 200, "CONTRATAR funciona em somente leitura", r.status + " " + JSON.stringify(r.data?.code));
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.access.level === "full", "e a igreja saiu do somente leitura pagando", r.data.plan?.access?.level);

// volta para somente leitura para testar o cancelar
await db.query(`UPDATE subscriptions SET status='past_due', current_period_end=now()-interval '10 days'
                WHERE organization_id=$1 AND status='active'`, [org]);
ok((await call("GET", "/api/auth/session", { cookie: A })).data.plan.access.level === "read_only", "de volta ao somente leitura");
r = await call("POST", "/api/billing/cancel", { cookie: A });
ok(r.status === 200 && r.data.plan.slug === "semente", "CANCELAR funciona em somente leitura", r.status + " " + JSON.stringify(r.data?.code));

console.log("\n== (b) A EXCEÇÃO VAZOU? tudo o mais tem que continuar barrado ==");
await db.query(`INSERT INTO subscriptions (organization_id, plan_id, status, started_at, current_period_start, current_period_end, provider)
                VALUES ($1,(SELECT id FROM plans WHERE slug='comunidade'),'past_due',now(),now(),now()-interval '10 days','bypass')`, [org]);
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.access.level === "read_only", "somente leitura de novo, para a bateria", r.data.plan?.access?.level);

const escritas = [
  ["POST", "/api/members", { name: "Novo", email: `n${u}@x.test` }, "criar membro"],
  ["PUT", `/api/members/${membro}`, { name: "Editado", email: `e${u}@x.test` }, "editar membro"],
  ["DELETE", `/api/members/${membro}`, null, "excluir membro"],
  ["POST", "/api/visitors", { name: "Novo", email: `nv${u}@x.test` }, "criar visitante"],
  ["PUT", `/api/visitors/${visita}`, { name: "X", email: `xv${u}@x.test` }, "editar visitante"],
  ["POST", `/api/visitors/${visita}/convert`, null, "converter visitante"],
  ["POST", "/api/cells", { name: "Outra" }, "criar célula"],
  ["PUT", `/api/cells/${celula}`, { name: "Renomeada" }, "editar célula"],
  ["DELETE", `/api/cells/${celula}`, null, "excluir célula"],
  ["POST", "/api/ministries", { name: "Outro" }, "criar ministério"],
  ["PUT", `/api/ministries/${min}`, { name: "Renomeado" }, "editar ministério"],
  ["DELETE", `/api/ministries/${min}`, null, "excluir ministério"],
  ["POST", `/api/ministries/${min}/attendance`, { date: "2026-09-06", records: [] }, "registrar presença"],
  ["POST", "/api/events", { title: "T", location: "L", startsAt: "2026-10-01T19:00:00Z" }, "criar evento"],
  ["POST", "/api/financeiro", { type: "income", description: "D", category: "Dízimos", amount: "1.00", transactionDate: "2026-09-01" }, "lançar no financeiro"],
  ["POST", "/api/users", { email: `z${u}@a.test`, fullName: "Z", roleSlug: "leitura" }, "convidar usuário"],
];
for (const [m, p, b, rot] of escritas) {
  const res = await call(m, p, { cookie: A, body: b });
  ok(res.status === 402 && res.data?.code === "subscription_read_only", `${rot} continua barrado`, `${res.status} ${res.data?.code}`);
}

console.log("\n== e as leituras seguem livres ==");
for (const p of ["/api/members", "/api/financeiro", "/api/export/members", "/api/export/financeiro", "/api/billing/plans"]) {
  ok((await call("GET", p, { cookie: A })).status === 200, `GET ${p}`);
}

console.log("\n== a exceção não virou furo de PERMISSÃO ==");
await db.query(`UPDATE subscriptions SET status='active', current_period_end=now()+interval '30 days' WHERE organization_id=$1 AND status='past_due'`, [org]);
await call("POST", "/api/users", { cookie: A, body: { email: `adm${u}@a.test`, fullName: "Adm", roleSlug: "admin", password: "senha1234" } });
const ADM = (await call("POST", "/api/auth/login", { body: { email: `adm${u}@a.test`, password: "senha1234" } })).cookie;
r = await call("POST", "/api/billing/subscribe", { cookie: ADM, body: { planSlug: "rede" } });
ok(r.status === 403 && r.data.code === "missing_permission", "administrador continua sem contratar", r.status + " " + r.data?.code);
r = await call("POST", "/api/billing/cancel", { cookie: ADM });
ok(r.status === 403 && r.data.code === "missing_permission", "e sem cancelar", r.status + " " + r.data?.code);
r = await call("POST", "/api/billing/subscribe", { body: { planSlug: "rede" } });
ok(r.status === 401, "sem sessão continua 401", r.status);

await db.end();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
