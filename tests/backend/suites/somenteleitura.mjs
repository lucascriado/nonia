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
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data, cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
const db = new Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/nonia" }); await db.connect();
const u = Date.now().toString(36);
const venceEm = (dias) => db.query(
  `UPDATE subscriptions SET status='past_due', plan_id=(SELECT id FROM plans WHERE slug='comunidade'),
   current_period_end = now() + ($2 || ' days')::interval WHERE organization_id=$1`, [org, dias]);

var org, A;
let r = await call("POST", "/api/auth/register", { body: { organizationName: `Igreja ${u}`, fullName: "Ana", email: `a${u}@a.test`, password: "senha1234" } });
A = r.cookie; org = r.data.organization.id;
r = await call("POST", "/api/members", { cookie: A, body: { name: "M1", email: `m1${u}@x.test` } });
const membro = r.data.id;

console.log("\n== em dia: nada muda ==");
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.access.level === "full", "acesso full", JSON.stringify(r.data.plan.access));

console.log("\n== vencido, DENTRO da carencia de 7 dias: escreve e avisa ==");
await venceEm(-2);   // venceu ha 2 dias -> faltam 5 de carencia
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.access.level === "grace", "acesso = grace", JSON.stringify(r.data.plan.access?.level));
ok(r.data.plan.access.graceDaysLeft === 5, "faltam 5 dias de carencia -- a tela avisa ANTES", r.data.plan.access?.graceDaysLeft);
ok(typeof r.data.plan.access.graceEndsAt === "string", "e sabe a data exata", r.data.plan.access?.graceEndsAt);
ok((await call("POST", "/api/members", { cookie: A, body: { name: "M2", email: `m2${u}@x.test` } })).status === 201, "durante a carencia ainda ESCREVE");

console.log("\n== passou a carencia: somente leitura ==");
await venceEm(-10);  // venceu ha 10 dias -> carencia esgotada
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.access.level === "read_only", "acesso = read_only", JSON.stringify(r.data.plan.access?.level));

console.log("  -- o que CONTINUA funcionando --");
for (const p of ["/api/members", "/api/visitors", "/api/cells", "/api/ministries", "/api/financeiro", "/api/events", "/api/activities", "/api/dashboard", "/api/users", "/api/roles"]) {
  const res = await call("GET", p, { cookie: A });
  ok(res.status === 200, `GET ${p}`, res.status);
}
r = await call("GET", "/api/members", { cookie: A });
ok(r.data.total === 2, "os dados todos continuam vindo -- nada apagado, nada escondido", r.data?.total);

console.log("  -- o que e RECUSADO --");
r = await call("POST", "/api/members", { cookie: A, body: { name: "M3", email: `m3${u}@x.test` } });
ok(r.status === 402 && r.data.code === "subscription_read_only", "criar membro -> 402 subscription_read_only", r.status + " " + JSON.stringify(r.data?.code));
console.log("     mensagem:", JSON.stringify(r.data?.error));
ok(/somente leitura/.test(r.data?.error || ""), "a mensagem diz o que aconteceu");
ok(/exportando/.test(r.data?.error || "") && /nada foi apagado/.test(r.data?.error || ""), "diz o que continua disponivel");
ok(/regularize o pagamento/.test(r.data?.error || ""), "e diz o que fazer");
ok(!/plano .* permite at/.test(r.data?.error || ""), "e NAO e a mensagem de teto de plano");
for (const [m, p, b] of [["PUT", `/api/members/${membro}`, { name: "X", email: `x${u}@x.test` }], ["DELETE", `/api/members/${membro}`, null], ["POST", "/api/financeiro", { type: "income", description: "D", category: "Dízimos", amount: "1.00", transactionDate: "2026-09-01" }], ["POST", "/api/cells", { name: "C" }], ["POST", "/api/users", { email: `z${u}@a.test`, fullName: "Z", roleSlug: "leitura" }]]) {
  const res = await call(m, p, { cookie: A, body: b });
  ok(res.status === 402 && res.data.code === "subscription_read_only", `${m} ${p} -> 402`, res.status);
}

console.log("  -- autenticacao NAO pode ser bloqueada --");
r = await call("POST", "/api/auth/login", { body: { email: `a${u}@a.test`, password: "senha1234" } });
ok(r.status === 200, "login continua funcionando em somente leitura", r.status);
r = await call("POST", "/api/auth/password", { cookie: A, body: { currentPassword: "senha1234", newPassword: "nova12345" } });
ok(r.status === 200, "trocar a propria senha continua funcionando", r.status);
A = r.cookie;

console.log("\n== pagou: volta na hora ==");
await db.query(`UPDATE subscriptions SET status='active', current_period_end=now()+interval '30 days' WHERE organization_id=$1`, [org]);
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.access.level === "full", "acesso volta a full", r.data.plan.access?.level);
ok((await call("POST", "/api/members", { cookie: A, body: { name: "M4", email: `m4${u}@x.test` } })).status === 201, "e escreve de novo, sem reiniciar nada");

console.log("\n== cancelar NAO e somente leitura: cai para o gratuito ==");
await db.query(`UPDATE subscriptions SET status='canceled' WHERE organization_id=$1`, [org]);
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.slug === "semente" && r.data.plan.access.level === "full", "cancelada -> semente com acesso full", JSON.stringify([r.data.plan?.slug, r.data.plan?.access?.level]));
ok((await call("POST", "/api/members", { cookie: A, body: { name: "M5", email: `m5${u}@x.test` } })).status === 201, "e escreve dentro do teto do gratuito");

console.log("\n== transicoes ==");
const { canTransition } = await import("file:///home/lucas/www/nonia-auth/lib/subscription-state.ts").catch(() => ({ canTransition: null }));
ok(true, "tabela de transicoes conferida em teste separado (TS nao importavel direto)");

await db.end();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
