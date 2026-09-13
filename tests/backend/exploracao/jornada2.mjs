import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("/home/lucas/www/nonia-auth/node_modules/pg");
const BASE = "http://127.0.0.1:3210";
const db = new Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/jornada" });
await db.connect();
const achados = [];
const anota = (g, t) => { achados.push({ g, t }); console.log(`      >> ${g}: ${t}`); };
async function call(method, path, { body, cookie } = {}) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json().catch(() => null) : await res.text();
  return { status: res.status, data, headers: res.headers };
}
const passo = (n, t) => console.log(`\n${"─".repeat(70)}\n${n}. ${t}\n${"─".repeat(70)}`);
const login = async (e) => (await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e, password: "senha1234" }) })).headers.get("set-cookie").split(";")[0];
const PASTOR = await login("pastor@ibcentral.test");
const ORG = (await db.query("SELECT id FROM organizations WHERE slug LIKE 'igreja-batista%'")).rows[0].id;

// ─── 5. a avaliação vence ────────────────────────────────────────────────────
passo(5, "A avaliação de 14 dias vence e a igreja cai para o Semente");
await db.query(`UPDATE subscriptions SET trial_ends_at = now() - interval '1 day' WHERE organization_id=$1`, [ORG]);
let r = await call("GET", "/api/auth/session", { cookie: PASTOR });
console.log(`   plano efetivo agora: ${r.data.plan.slug} (${r.data.plan.source}) | teto ${r.data.plan.maxMembers} | avaliação expirada: ${r.data.plan.trialExpired}`);
anota("BLOQUEIA", "nada avisa a igreja de que a avaliação está acabando NEM de que acabou. Não há e-mail e nenhuma tela lê plan.trialDaysLeft. A pessoa descobre esbarrando num erro dias depois.");

console.log("   -- esbarrando no teto de membros --");
await db.query(`UPDATE plans SET max_members = 4 WHERE slug='semente'`);   // artifício de teste: 4 em vez de 100
r = await call("POST", "/api/members", { cookie: PASTOR, body: { name: "Quinto Membro", email: "quinto@x.test" } });
console.log(`   ${r.status} ${r.data?.code}`);
console.log(`   "${r.data?.error}"`);
console.log(`   corpo: resource=${r.data?.resource} limit=${r.data?.limit} current=${r.data?.current} suggestedPlan=${r.data?.suggestedPlan}`);

// ─── 6. contrata o Comunidade ────────────────────────────────────────────────
passo(6, "Contrata o Comunidade pelo bypass");
r = await call("GET", "/api/billing/plans", { cookie: PASTOR });
console.log(`   GET /api/billing/plans: ${r.status} | canSubscribe=${r.data?.canSubscribe} | ${r.data?.plans?.map(p=>p.slug).join(", ")}`);
r = await call("POST", "/api/billing/subscribe", { cookie: PASTOR, body: { planSlug: "comunidade" } });
console.log(`   contratou: ${r.status} | plano ${r.data?.plan?.slug} | teto ${r.data?.plan?.maxMembers}`);
r = await call("POST", "/api/members", { cookie: PASTOR, body: { name: "Quinto Membro", email: "quinto@x.test" } });
console.log(`   agora o quinto membro entra: ${r.status}`);
anota("BLOQUEIA", "não existe tela de plano/assinatura. /api/billing/plans, /subscribe e /cancel não são chamados por nada. O passo 6 também é impossível pela interface.");

// ─── 7. a mensalidade vence e passa a carência ───────────────────────────────
passo(7, "A mensalidade vence, passa a carência, e a igreja vira somente leitura");
await db.query(`UPDATE subscriptions SET status='past_due', current_period_end=now()-interval '2 days' WHERE organization_id=$1 AND status='active'`, [ORG]);
r = await call("GET", "/api/auth/session", { cookie: PASTOR });
console.log(`   dentro da carência: access=${r.data.plan.access.level}, faltam ${r.data.plan.access.graceDaysLeft} dias`);
anota("BLOQUEIA", "a carência de 7 dias existe para a igreja ser avisada antes de virar somente leitura, mas nenhuma tela lê plan.access. O aviso não chega, e a carência não serve para nada na prática.");
await db.query(`UPDATE subscriptions SET current_period_end=now()-interval '10 days' WHERE organization_id=$1 AND status='past_due'`, [ORG]);
r = await call("GET", "/api/auth/session", { cookie: PASTOR });
console.log(`   passada a carência: access=${r.data.plan.access.level}`);
r = await call("POST", "/api/members", { cookie: PASTOR, body: { name: "Sexto", email: "sexto@x.test" } });
console.log(`   escrever: ${r.status} ${r.data?.code}`);
console.log(`   "${r.data?.error}"`);

console.log("   -- exportar nesse estado, que é o ponto --");
for (const rec of ["members", "visitors", "financeiro"]) {
  const res = await call("GET", `/api/export/${rec}`, { cookie: PASTOR });
  console.log(`   /api/export/${rec.padEnd(10)} -> ${res.status} (${String(res.data).length} bytes)`);
}
anota("BLOQUEIA", "exportar funciona na API mas não existe botão em nenhuma tela. A garantia de 'a igreja leva o que é dela' não está ao alcance de quem usa o produto.");

console.log("\n   -- E AGORA A PERGUNTA QUE IMPORTA: dá para se regularizar? --");
r = await call("POST", "/api/billing/subscribe", { cookie: PASTOR, body: { planSlug: "comunidade" } });
console.log(`   contratar/renovar estando em somente leitura: ${r.status} ${r.data?.code}`);
console.log(`   "${r.data?.error}"`);
const bloqueado = r.status === 402;
r = await call("POST", "/api/billing/cancel", { cookie: PASTOR });
console.log(`   cancelar estando em somente leitura:          ${r.status} ${r.data?.code}`);
if (bloqueado) anota("BLOQUEIA", "IMPASSE: a igreja vira somente leitura POR CAUSA do pagamento, e as rotas de billing exigem billing.write, que é escrita — então a guarda de somente leitura barra justamente as duas ações que resolveriam (contratar e cancelar). A igreja fica presa sem saída pelo produto.");

// ─── 8. cancela ──────────────────────────────────────────────────────────────
passo(8, "Cancela e volta ao gratuito");
if (bloqueado) {
  console.log("   (só consigo seguir mexendo no banco à mão, o que já é o achado acima)");
  await db.query(`UPDATE subscriptions SET status='active', current_period_end=now()+interval '30 days' WHERE organization_id=$1 AND status='past_due'`, [ORG]);
}
r = await call("POST", "/api/billing/cancel", { cookie: PASTOR });
console.log(`   cancelou: ${r.status} | plano agora ${r.data?.plan?.slug} (${r.data?.plan?.source}) | teto ${r.data?.plan?.maxMembers}`);
r = await call("GET", "/api/members", { cookie: PASTOR });
console.log(`   os ${r.data.length} membros continuam lá, nada apagado`);

await db.query(`UPDATE plans SET max_members = 100 WHERE slug='semente'`);
await db.end();
console.log("\n\n=== ACHADOS DA SEGUNDA METADE ===");
for (const a of achados) console.log(`  [${a.g}] ${a.t}`);
