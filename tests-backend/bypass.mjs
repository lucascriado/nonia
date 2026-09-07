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

console.log("\n== ponto de partida: avaliacao ==");
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.slug === "avaliacao" && r.data.plan.source === "trial", "nasce em avaliacao", r.data.plan?.slug);

console.log("\n== a tela sabe o que oferecer ==");
r = await call("GET", "/api/billing/plans", { cookie: A });
ok(r.status === 200 && r.data.canSubscribe === true, "com a variavel ligada, canSubscribe = true");
ok(r.data.plans.length === 3 && !r.data.plans.some(p => p.slug === "avaliacao"), "3 planos, sem a avaliacao", r.data.plans?.map(p=>p.slug).join(","));
ok(r.data.plans.find(p=>p.slug==="comunidade").priceCents === 8900, "preco vem do banco, nao do codigo");
ok(r.data.current.slug === "avaliacao", "e diz em qual a igreja esta");

console.log("\n== clicou, adquiriu ==");
r = await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });
ok(r.status === 200 && r.data.plan.slug === "comunidade", "contratou Comunidade", r.status + " " + JSON.stringify(r.data?.code ?? r.data?.plan?.slug));
ok(r.data.plan.source === "subscription", "e o plano efetivo ja veio da assinatura", r.data.plan?.source);
ok(r.data.plan.maxMembers === null, "teto de membros sumiu na hora", r.data.plan?.maxMembers);
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.plan.slug === "comunidade" && r.data.plan.access.level === "full", "e persiste na leitura seguinte");

console.log("\n== a marcacao de origem, que e o que impede confundir com pagamento ==");
const sub = (await db.query(`SELECT status, provider, provider_subscription_id, current_period_end FROM subscriptions WHERE organization_id=$1 AND status='active'`, [org])).rows[0];
ok(sub.provider === "bypass", "provider = 'bypass'", sub.provider);
ok(sub.provider_subscription_id.startsWith("bypass:"), "e o id externo tambem denuncia", sub.provider_subscription_id);
ok(sub.current_period_end !== null, "com periodo de vigencia de 1 mes");
const ev = (await db.query(`SELECT type, provider, payload FROM billing_events WHERE organization_id=$1 ORDER BY received_at`, [org])).rows;
ok(ev.length === 1 && ev[0].type === "subscription.activated" && ev[0].provider === "bypass", "billing_event registrado", JSON.stringify(ev.map(e=>e.type)));
ok(ev[0].payload.byUserId && ev[0].payload.previousStatus === "trialing", "com quem clicou e o estado anterior", JSON.stringify(ev[0].payload));
const pag = (await db.query(`SELECT count(*)::int n FROM subscription_payments WHERE organization_id=$1`, [org])).rows[0];
ok(pag.n === 0, "NENHUMA linha em subscription_payments -- nao houve pagamento", pag.n);

console.log("\n== nao da para contratar o que nao se contrata ==");
ok((await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "avaliacao" } })).data.code === "invalid_plan", "avaliacao nao e contratavel");
ok((await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "inexistente" } })).status === 404, "plano inexistente -> 404");
ok((await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } })).data.code === "already_subscribed", "contratar o mesmo de novo -> already_subscribed");

console.log("\n== o caminho de VOLTA, para poder testar mais de uma vez ==");
r = await call("POST", "/api/billing/cancel", { cookie: A });
ok(r.status === 200 && r.data.plan.slug === "semente", "cancelou e voltou para o semente", JSON.stringify(r.data?.plan?.slug));
ok(r.data.plan.source === "free" && r.data.plan.maxMembers === 100, "com o teto do gratuito de volta", JSON.stringify([r.data.plan?.source, r.data.plan?.maxMembers]));
const ev2 = (await db.query(`SELECT type FROM billing_events WHERE organization_id=$1 ORDER BY received_at`, [org])).rows;
ok(ev2.map(e=>e.type).join(",") === "subscription.activated,subscription.canceled", "os dois eventos registrados", ev2.map(e=>e.type).join(","));
ok((await call("POST", "/api/billing/cancel", { cookie: A })).data.code === "no_subscription", "cancelar de novo -> no_subscription");

console.log("\n== e da para repetir o ciclo ==");
r = await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "rede" } });
ok(r.status === 200 && r.data.plan.slug === "rede", "contratou Rede depois de ter cancelado", r.status);
const linhas = (await db.query(`SELECT count(*)::int n FROM subscriptions WHERE organization_id=$1`, [org])).rows[0];
ok(linhas.n === 2, "2 linhas: a cancelada como historico e a nova vigente", linhas.n);

console.log("\n== so o proprietario contrata ==");
r = await call("POST", "/api/users", { cookie: A, body: { email: `ad${u}@a.test`, fullName: "Adm", roleSlug: "admin", password: "senha1234" } });
const adm = (await call("POST", "/api/auth/login", { body: { email: `ad${u}@a.test`, password: "senha1234" } })).cookie;
r = await call("POST", "/api/billing/subscribe", { cookie: adm, body: { planSlug: "comunidade" } });
ok(r.status === 403 && r.data.code === "missing_permission", "administrador nao contrata -> 403", r.status + " " + JSON.stringify(r.data?.code));
ok((await call("GET", "/api/billing/plans", { cookie: adm })).status === 200, "mas enxerga os planos (billing.read)");

await db.end();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
