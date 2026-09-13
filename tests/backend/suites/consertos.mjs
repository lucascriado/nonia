const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
async function call(m, p, { body, cookie, raw } = {}) {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: raw !== undefined ? raw : (body ? JSON.stringify(body) : undefined), redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null, c: r.headers.get("set-cookie")?.split(";")[0] };
}
const u = Date.now().toString(36);
let r = await call("POST", "/api/auth/register", { body: { organizationName: `Igreja ${u}`, fullName: "Pastor Anderson", email: `p${u}@x.test`, password: "senha1234" } });
const A = r.c;

console.log("== cancelar avaliação vigente é recusado ==");
r = await call("POST", "/api/billing/cancel", { cookie: A });
ok(r.s === 409 && r.d?.code === "trial_not_cancelable", "409 trial_not_cancelable", `${r.s} ${r.d?.code}`);
ok(/termina sozinha em 14 dias/.test(r.d?.error || ""), "a mensagem diz quando termina sozinha", r.d?.error);
ok(/sem cobrança/.test(r.d?.error || ""), "e que não haverá cobrança");
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.d.plan.slug === "avaliacao" && r.d.plan.trialDaysLeft === 14, "a avaliação segue intacta -- nada foi perdido");

console.log("\n== mas cancelar o que É cancelável continua valendo ==");
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });
r = await call("POST", "/api/billing/cancel", { cookie: A });
ok(r.s === 200 && r.d?.plan?.slug === "semente", "cancelar assinatura ativa funciona", `${r.s} ${r.d?.code}`);

console.log("\n== corpo JSON malformado é 400, não 500 ==");
for (const p of ["/api/billing/subscribe", "/api/members", "/api/visitors", "/api/cells", "/api/ministries", "/api/events", "/api/financeiro", "/api/users", "/api/auth/switch", "/api/auth/password"]) {
  const res = await call("POST", p, { cookie: A, raw: "{isto nao e json" });
  ok(res.s === 400 && res.d?.code === "invalid_json", `POST ${p}`, `${res.s} ${res.d?.code}`);
}
r = await call("POST", "/api/auth/login", { raw: "nao e json" });
ok(r.s === 400 && r.d?.code === "invalid_json", "e nas rotas públicas também", `${r.s} ${r.d?.code}`);

console.log("\n== a atividade é gravada junto com a assinatura ==");
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });
r = await call("GET", "/api/activities", { cookie: A });
ok(/contratou o plano/.test(r.d.records[0]?.action || ""), "contratar registra atividade", r.d.records[0]?.action);
ok(r.d.records[0]?.actor === "Pastor Anderson", "com o nome de quem fez", r.d.records[0]?.actor);
await call("POST", "/api/billing/cancel", { cookie: A });
r = await call("GET", "/api/activities", { cookie: A });
ok(/cancelou o plano/.test(r.d.records[0]?.action || ""), "cancelar também", r.d.records[0]?.action);

console.log("\n== convite: e-mail é extra, nunca requisito ==");
// contrata antes para não esbarrar em teto nenhum: o Semente tem 2 assentos
// desde a 012, e o que esta suíte mede é o e-mail do convite, não o teto.
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });
r = await call("POST", "/api/users", { cookie: A, body: { email: `conv${u}@exemplo.test`, fullName: "Marta", roleSlug: "secretaria" } });
ok(r.s === 201, "convite criado", r.s);
ok(typeof r.d?.emailSent === "boolean", "a resposta diz se o e-mail saiu, para a tela ser honesta", JSON.stringify(r.d?.emailSent));
ok(Boolean(r.d?.inviteUrl), "e a inviteUrl vem SEMPRE -- é o caminho manual");
const token = r.d.inviteUrl.split("/convite/")[1];
ok((await call("GET", `/api/auth/invite?token=${token}`)).s === 200, "o convite existe e vale, tenha o e-mail saído ou não");
r = await call("POST", "/api/auth/invite/accept", { body: { token, fullName: "Marta", password: "senha1234" } });
ok(r.s === 201 && r.d?.role?.slug === "secretaria", "e o convidado entra pelo link", r.s);

console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
