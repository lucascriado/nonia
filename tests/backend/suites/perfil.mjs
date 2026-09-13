import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("/home/lucas/www/nonia-auth/node_modules/pg");
const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
async function call(m, p, { body, cookie } = {}) {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null, c: r.headers.get("set-cookie")?.split(";")[0] };
}
const db = new Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/nonia" }); await db.connect();
const u = Date.now().toString(36);
const FOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

let r = await call("POST", "/api/auth/register", { body: { organizationName: `Igreja ${u}`, fullName: "Pastor Anderson", email: `p${u}@x.test`, password: "senha1234", phone: "(11) 90000-0000" } });
const A = r.c, org = r.d.organization.id;
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });

console.log("== dados da igreja ==");
r = await call("GET", "/api/organization", { cookie: A });
ok(r.s === 200 && r.d.slug.startsWith("igreja-"), "GET devolve os dados", `${r.s} ${r.d?.slug}`);
r = await call("PATCH", "/api/organization", { cookie: A, body: { name: "Igreja Batista Central", document: "11.222.333/0001-81", phone: "(11) 3333-4444" } });
ok(r.s === 200 && r.d.name === "Igreja Batista Central", "PATCH altera nome, CNPJ e telefone", `${r.s} ${r.d?.name}`);
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.d.organization.name === "Igreja Batista Central", "e a sessão já reflete o nome novo");
r = await call("PATCH", "/api/organization", { cookie: A, body: { slug: "outro-endereco" } });
ok(r.s === 400 && r.d.code === "slug_not_editable", "o slug é recusado, não ignorado em silêncio", `${r.s} ${r.d?.code}`);
r = await call("PATCH", "/api/organization", { cookie: A, body: { name: "   " } });
ok(r.s === 400, "nome vazio recusado", r.s);
r = await call("PATCH", "/api/organization", { cookie: A, body: { email: "nao-e-email" } });
ok(r.s === 400, "e-mail inválido recusado", r.s);
r = await call("PATCH", "/api/organization", { cookie: A, body: { document: null } });
ok(r.s === 200 && r.d.document === null, "dá para limpar o CNPJ mandando null", JSON.stringify(r.d?.document));

console.log("\n== permissões: as órfãs passaram a valer ==");
await call("POST", "/api/users", { cookie: A, body: { email: `sec${u}@x.test`, fullName: "Marta", roleSlug: "secretaria", password: "senha1234" } });
const S = (await call("POST", "/api/auth/login", { body: { email: `sec${u}@x.test`, password: "senha1234" } })).c;
ok((await call("GET", "/api/organization", { cookie: S })).s === 200, "secretaria LÊ os dados da igreja (organization.read)");
r = await call("PATCH", "/api/organization", { cookie: S, body: { name: "Tentativa" } });
ok(r.s === 403 && r.d.code === "missing_permission", "mas NÃO edita (não tem organization.write)", `${r.s} ${r.d?.code}`);
ok(/Peça a um responsável/.test(r.d?.error || ""), "e a mensagem agora diz a quem pedir", r.d?.error);
await call("POST", "/api/users", { cookie: A, body: { email: `l${u}@x.test`, fullName: "Léo", roleSlug: "leitura", password: "senha1234" } });
const L = (await call("POST", "/api/auth/login", { body: { email: `l${u}@x.test`, password: "senha1234" } })).c;
ok((await call("GET", "/api/organization", { cookie: L })).s === 200, "leitura também lê");

console.log("\n== o próprio perfil ==");
r = await call("PATCH", "/api/auth/profile", { cookie: L, body: { fullName: "Léo Ferreira", phone: "(11) 98888-7777", avatarUrl: FOTO } });
ok(r.s === 200, "qualquer papel edita o PRÓPRIO perfil, sem permissão especial", `${r.s} ${r.d?.code}`);
r = await call("GET", "/api/auth/session", { cookie: L });
ok(r.d.user.name === "Léo Ferreira", "o nome mudou", r.d?.user?.name);
ok(r.d.user.phone === "(11) 98888-7777", "o telefone veio no SessionPayload, para o formulário preencher", r.d?.user?.phone);
ok(r.d.user.avatarUrl === FOTO, "e a foto");
r = await call("PATCH", "/api/auth/profile", { cookie: L, body: { avatarUrl: null } });
ok(r.s === 200 && (await call("GET", "/api/auth/session", { cookie: L })).d.user.avatarUrl === null, "dá para remover a foto");
r = await call("PATCH", "/api/auth/profile", { cookie: L, body: { email: "outro@x.test" } });
ok(r.s === 400 && r.d.code === "email_not_editable", "o e-mail de acesso é recusado", `${r.s} ${r.d?.code}`);
r = await call("PATCH", "/api/auth/profile", { cookie: L, body: { avatarUrl: "data:text/html;base64,AAAA" } });
ok(r.s === 400 && r.d.code === "invalid_photo", "foto que não é PNG/JPG é recusada", `${r.s} ${r.d?.code}`);
r = await call("PATCH", "/api/auth/profile", { cookie: L, body: { fullName: "  " } });
ok(r.s === 400, "nome vazio recusado", r.s);
ok((await call("PATCH", "/api/auth/profile", { body: { fullName: "X" } })).s === 401, "sem sessão -> 401");

console.log("\n== e o perfil NÃO é caso especial da rota de terceiros ==");
const meu = (await call("GET", "/api/auth/session", { cookie: L })).d.user.id;
r = await call("PATCH", `/api/users/${meu}`, { cookie: L, body: { fullName: "Tentativa" } });
ok(r.s === 403, "leitura não usa /api/users nem sobre si mesma", r.s);

console.log("\n== somente leitura: a igreja congela, a pessoa não ==");
await db.query(`UPDATE subscriptions SET status='past_due', current_period_end=now()-($1 || $2)::interval WHERE organization_id=$3 AND status='active'`, ["10", " days", org]);
ok((await call("GET", "/api/auth/session", { cookie: A })).d.plan.access.level === "read_only", "igreja em somente leitura");
r = await call("PATCH", "/api/organization", { cookie: A, body: { name: "Outro Nome" } });
ok(r.s === 402 && r.d.code === "subscription_read_only", "editar a IGREJA é bloqueado", `${r.s} ${r.d?.code}`);
r = await call("PATCH", "/api/auth/profile", { cookie: A, body: { fullName: "Pastor A. Silva" } });
ok(r.s === 200, "mas o PRÓPRIO perfil continua editável -- não é dado da igreja", `${r.s} ${r.d?.code}`);
ok((await call("GET", "/api/organization", { cookie: A })).s === 200, "e ler a igreja continua valendo");

await db.end();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
