import { createRequire } from "node:module";
const require2 = createRequire("/home/lucas/www/nonia-auth/package.json");
const { Client } = require2("pg");
const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
const call = async (m, p, { body, cookie } = {}) => {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null, c: r.headers.get("set-cookie")?.split(";")[0] };
};
const db = new Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/nonia" }); await db.connect();
const u = Date.now().toString(36);

let r = await call("POST", "/api/auth/register", { body: { organizationName: "Igreja Central", fullName: "Pastor Anderson", email: `p${u}@x.test`, password: "senha1234" } });
let A = r.c;
const orgA = r.d.organization.id;
ok(r.s === 201, "cadastro (que agora usa o miolo compartilhado) continua funcionando", r.s);
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.d.plan.slug === "avaliacao" && r.d.plan.trialDaysLeft === 14, "e a PRIMEIRA igreja nasce em avaliação de 14 dias", r.d.plan?.slug);

console.log("\n== plantar uma congregação nova, sem sair da conta ==");
r = await call("POST", "/api/organizations", { cookie: A, body: { organizationName: "Congregação Jardim", document: "11.222.333/0001-81" } });
ok(r.s === 201, "criou", `${r.s} ${r.d?.code}`);
ok(r.d.organization.name === "Congregação Jardim", "e a SESSÃO já é da igreja nova", r.d?.organization?.name);
ok(r.d.role.slug === "owner", "como proprietária dela", r.d?.role?.slug);
ok(Boolean(r.c) && r.c !== A, "com cookie novo, como no /switch");
const NOVA = r.c;
const orgB = r.d.organization.id;

console.log("\n== a segunda NÃO ganha avaliação ==");
r = await call("GET", "/api/auth/session", { cookie: NOVA });
ok(r.d.plan.slug === "semente" && r.d.plan.source === "free", "nasce no Semente, gratuito", JSON.stringify([r.d.plan?.slug, r.d.plan?.source]));
ok(r.d.plan.trialDaysLeft === null && r.d.plan.trialExpired === false, "sem dias de avaliação e sem dizer que uma terminou", JSON.stringify([r.d.plan?.trialDaysLeft, r.d.plan?.trialExpired]));
const assin = (await db.query("SELECT count(*)::int n FROM subscriptions WHERE organization_id=$1", [orgB])).rows[0].n;
ok(assin === 0, "e sem linha de assinatura inventada -- o plano efetivo resolve sozinho", assin);
ok(r.d.plan.maxMembers === 100 && r.d.plan.maxUsers === 2, "com os tetos do Semente (2 acessos desde a 012)", JSON.stringify([r.d.plan?.maxMembers, r.d.plan?.maxUsers]));

console.log("\n== o índice único do is_default foi obedecido ==");
const padroes = (await db.query("SELECT count(*)::int n FROM organization_members WHERE user_id=(SELECT id FROM users WHERE email=$1) AND is_default", [`p${u}@x.test`])).rows[0].n;
ok(padroes === 1, "só UM vínculo padrão para a pessoa", padroes);
const vinculos = (await db.query("SELECT o.name, om.is_default FROM organization_members om JOIN organizations o ON o.id=om.organization_id WHERE om.user_id=(SELECT id FROM users WHERE email=$1) ORDER BY om.is_default DESC", [`p${u}@x.test`])).rows;
ok(vinculos.length === 2 && vinculos[0].name === "Igreja Central" && vinculos[0].is_default, "e a padrão continua sendo a primeira", JSON.stringify(vinculos));

console.log("\n== a coleção, que é o que o seletor da barra lateral consome ==");
r = await call("GET", "/api/organizations", { cookie: NOVA });
ok(r.s === 200 && r.d.organizations.length === 2, "duas igrejas", r.d?.organizations?.length);
ok(r.d.current === orgB, "e diz qual é a atual", r.d?.current === orgB);
ok(r.d.organizations.every((o) => o.roleSlug === "owner"), "proprietária das duas", JSON.stringify(r.d.organizations.map(o => o.roleSlug)));

console.log("\n== O QUE NÃO PODE RELAXAR: isolamento entre as duas ==");
await call("POST", "/api/members", { cookie: NOVA, body: { name: "Membro do Jardim", email: `mj${u}@x.test` } });
r = await call("POST", "/api/auth/switch", { cookie: NOVA, body: { organizationSlug: "igreja-central" } });
A = r.c;
await call("POST", "/api/members", { cookie: A, body: { name: "Membro da Central", email: `mc${u}@x.test` } });
r = await call("GET", "/api/members", { cookie: A });
ok(r.d.total === 1 && r.d.records[0].name === "Membro da Central", "na Central vê só o dela", JSON.stringify(r.d.records.map(m => m.name)));
// a célula precisa nascer ANTES de trocar de sessão: o /switch revoga o
// cookie anterior, e usar o revogado depois só devolve 401.
await call("POST", "/api/cells", { cookie: A, body: { name: "Célula Central" } });
const volta = await call("POST", "/api/auth/switch", { cookie: A, body: { organizationSlug: "congregacao-jardim" } });
r = await call("GET", "/api/members", { cookie: volta.c });
ok(r.d.total === 1 && r.d.records[0].name === "Membro do Jardim", "no Jardim vê só o dele -- a MESMA pessoa, dados separados", JSON.stringify(r.d.records.map(m => m.name)));
const cruzado = await db.query(`SELECT count(*)::int n FROM people WHERE organization_id=$1`, [orgA]);
ok(cruzado.rows[0].n === 1, "e no banco cada pessoa está sob a organização certa", cruzado.rows[0].n);

console.log("\n== e a gravação cruzada continua sendo recusada pelo BANCO ==");
const pessoaJardim = (await db.query("SELECT id FROM people WHERE organization_id=$1 LIMIT 1", [orgB])).rows[0].id;
const celulas = (await db.query("SELECT count(*)::int n FROM cells WHERE organization_id=$1", [orgA])).rows[0].n;
ok(celulas === 1, "há uma célula na Central para o teste morder", celulas);
await db.query("BEGIN");
let barrou = false;
try { await db.query("UPDATE cells SET leader_id=$1 WHERE organization_id=$2", [pessoaJardim, orgA]); }
catch (e) { barrou = e.code === "23503"; }
await db.query("ROLLBACK");
ok(barrou, "líder de uma congregação numa célula da outra -> 23503, como antes");

console.log("\n== guardas da rota nova ==");
ok((await call("POST", "/api/organizations", { body: { organizationName: "X" } })).s === 401, "sem sessão -> 401");
ok((await call("POST", "/api/organizations", { cookie: volta.c, body: {} })).s === 400, "sem nome -> 400");
r = await call("POST", "/api/organizations", { cookie: volta.c, body: { organizationName: "Y", document: "123" } });
ok(r.s === 400 && r.d.code === "invalid_document", "CNPJ inválido -> 400 invalid_document", `${r.s} ${r.d?.code}`);
r = await call("POST", "/api/organizations", { cookie: volta.c, body: { organizationName: "Igreja Central" } });
ok(r.s === 201 && r.d.organization.slug !== "igreja-central", "nome repetido ganha slug próprio, não colide", r.d?.organization?.slug);

await db.end();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
