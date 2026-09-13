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

let r = await call("POST", "/api/auth/register", { body: { organizationName: `Igreja ${u}`, fullName: "Ana", email: `a${u}@a.test`, password: "senha1234" } });
const A = r.cookie, org = r.data.organization.id;

console.log("\n== dia 1: quem se cadastra entra em AVALIACAO ==");
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.slug === "avaliacao" && r.data.plan.source === "trial", "plano efetivo = avaliacao (trial)", JSON.stringify(r.data.plan?.slug));
ok(r.data.plan.trialDaysLeft === 14, "faltam 14 dias", r.data.plan.trialDaysLeft);
ok(r.data.plan.maxMembers === 200, "teto da avaliacao: 200 membros", r.data.plan.maxMembers);
ok(typeof r.data.plan.trialEndsAt === "string", "trialEndsAt legivel pelo frontend", r.data.plan.trialEndsAt);
ok(r.data.plan.usage.members === 0 && r.data.plan.usage.users === 1, "uso atual vem junto, para avisar antes", JSON.stringify(r.data.plan.usage));

console.log("\n== dia 10: o aviso encurta sozinho, sem ninguem rodar nada ==");
await db.query(`UPDATE subscriptions SET trial_ends_at = now() + interval '4 days' WHERE organization_id=$1`, [org]);
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.trialDaysLeft === 4, "faltam 4 dias", r.data.plan.trialDaysLeft);
ok(r.data.plan.source === "trial", "ainda em avaliacao");

console.log("\n== dia 15: o prazo virou. Rebaixamento acontece na LEITURA ==");
await db.query(`UPDATE subscriptions SET trial_ends_at = now() - interval '1 day' WHERE organization_id=$1`, [org]);
const linha = (await db.query(`SELECT status FROM subscriptions WHERE organization_id=$1`, [org])).rows[0];
ok(linha.status === "trialing", "a linha em subscriptions continua 'trialing' (ninguem rodou tarefa)", linha.status);
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.slug === "semente" && r.data.plan.source === "free", "mas o plano EFETIVO ja e semente/free", JSON.stringify([r.data.plan.slug, r.data.plan.source]));
ok(r.data.plan.trialExpired === true, "e a API diz que a avaliacao terminou");
ok(r.data.plan.maxMembers === 100, "teto caiu para 100", r.data.plan.maxMembers);
ok(r.data.plan.trialDaysLeft === null, "sem dias restantes");

console.log("\n== a igreja que passou dos 100 durante a avaliacao ==");
await db.query(`UPDATE plans SET max_members=3 WHERE slug='avaliacao'`);
await db.query(`UPDATE subscriptions SET trial_ends_at = now() + interval '5 days' WHERE organization_id=$1`, [org]);
for (const n of [1,2,3]) await call("POST", "/api/members", { cookie: A, body: { name: `M${n}`, email: `m${n}${u}@x.test` } });
await db.query(`UPDATE plans SET max_members=2 WHERE slug='semente'`);
await db.query(`UPDATE subscriptions SET trial_ends_at = now() - interval '1 day' WHERE organization_id=$1`, [org]);
r = await call("GET", "/api/members", { cookie: A });
ok(r.status === 200 && r.data.total === 3, "os 3 membros continuam la depois do rebaixamento", r.data?.total);
r = await call("PUT", `/api/members/${r.data.records[0].id}`, { cookie: A, body: { name: "Editado", email: `ed${u}@x.test` } });
ok(r.status === 200, "e continuam editaveis", r.status);
r = await call("POST", "/api/members", { cookie: A, body: { name: "M4", email: `m4${u}@x.test` } });
ok(r.status === 402, "so a criacao nova e barrada", r.status);
console.log("     mensagem:", JSON.stringify(r.data?.error));
ok(/avaliação terminou/.test(r.data?.error || ""), "a mensagem DIZ que a avaliacao terminou");
ok(/continua disponível/.test(r.data?.error || ""), "e tranquiliza sobre o que ja existe");
ok(r.data?.trialExpired === true, "o corpo marca trialExpired, para a tela mudar o CTA");

console.log("\n== assinatura paga vence tudo ==");
await db.query(`UPDATE subscriptions SET status='active', plan_id=(SELECT id FROM plans WHERE slug='comunidade') WHERE organization_id=$1`, [org]);
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.slug === "comunidade" && r.data.plan.source === "subscription", "plano efetivo = comunidade (subscription)", JSON.stringify([r.data.plan.slug, r.data.plan.source]));
ok((await call("POST", "/api/members", { cookie: A, body: { name: "M5", email: `m5${u}@x.test` } })).status === 201, "teto de membros sumiu na hora");

console.log("\n== cobranca ainda nao confirmada NAO libera o plano pago ==");
await db.query(`UPDATE subscriptions SET status='incomplete' WHERE organization_id=$1`, [org]);
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.slug === "semente", "'incomplete' cai para semente, nao libera Comunidade", r.data.plan.slug);

console.log("\n== organizacao sem assinatura nenhuma ==");
await db.query(`DELETE FROM subscriptions WHERE organization_id=$1`, [org]);
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.slug === "semente" && r.data.plan.source === "free", "cai para semente, o piso de todo mundo", JSON.stringify(r.data.plan?.slug));

await db.query(`UPDATE plans SET max_members=100 WHERE slug='semente'`);
await db.query(`UPDATE plans SET max_members=200 WHERE slug='avaliacao'`);
await db.end();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
