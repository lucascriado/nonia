import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("/home/lucas/www/nonia-auth/node_modules/pg");
const BASE = "http://127.0.0.1:3210";
const DB = "postgresql://nonia:nonia@127.0.0.1:54329/nonia";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };

async function call(method, path, { body, cookie } = {}) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data, cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
const db = new Client({ connectionString: DB }); await db.connect();
const plano = async (org, slug) => db.query(
  `UPDATE subscriptions SET plan_id = (SELECT id FROM plans WHERE slug=$2) WHERE organization_id=$1`, [org, slug]);

const u = Date.now().toString(36);
let r = await call("POST", "/api/auth/register", { body: { organizationName: `Igreja ${u}`, fullName: "Ana", email: `ana${u}@a.test`, password: "senha1234" } });
const A = r.cookie;
const org = r.data.organization.id;

console.log("\n== teto de MEMBROS ==");
// teto artificial de 2 membros, para nao cadastrar 100
await db.query(`INSERT INTO plans (slug,name,price_cents,max_members,max_users,sort_order) VALUES ('teste-2','Teste2',0,2,5,9)
                ON CONFLICT (slug) DO UPDATE SET max_members=2`);
await plano(org, "teste-2");
ok((await call("POST", "/api/members", { cookie: A, body: { name: "M1", email: `m1${u}@x.test` } })).status === 201, "1o membro passa");
ok((await call("POST", "/api/members", { cookie: A, body: { name: "M2", email: `m2${u}@x.test` } })).status === 201, "2o membro passa (no teto)");
r = await call("POST", "/api/members", { cookie: A, body: { name: "M3", email: `m3${u}@x.test` } });
ok(r.status === 402 && r.data.code === "plan_limit_reached", "3o membro -> 402 plan_limit_reached", r.status + " " + JSON.stringify(r.data));
console.log("     mensagem:", JSON.stringify(r.data?.error));
ok(/2 membros/.test(r.data?.error || ""), "a mensagem diz o teto");
ok(/plano /.test(r.data?.error || ""), "e diz qual plano resolve");
ok(r.data?.limit === 2 && r.data?.current === 2 && r.data?.resource === "members", "o corpo traz teto, uso e recurso", JSON.stringify(r.data));

console.log("\n== visitante NAO conta como membro (a landing promete 'membros') ==");
r = await call("POST", "/api/visitors", { cookie: A, body: { name: "V1", email: `v1${u}@x.test` } });
ok(r.status === 201, "visitante passa mesmo com o teto de membros estourado", r.status);
const vis = r.data.id;

console.log("\n== converter visitante em membro CONTA ==");
r = await call("POST", `/api/visitors/${vis}/convert`, { cookie: A });
ok(r.status === 402 && r.data.code === "plan_limit_reached", "conversao no teto -> 402", r.status + " " + JSON.stringify(r.data?.code));

console.log("\n== plano maior remove o teto NA HORA ==");
await plano(org, "comunidade");
r = await call("POST", "/api/members", { cookie: A, body: { name: "M3", email: `m3${u}@x.test` } });
ok(r.status === 201, "Comunidade (max_members NULL) libera na hora, sem reiniciar nada", r.status);
r = await call("POST", `/api/visitors/${vis}/convert`, { cookie: A });
ok(r.status === 200, "e a conversao passa", r.status);

console.log("\n== organizacao JA ACIMA do teto: nao perde nada ==");
await plano(org, "teste-2");
const antes = (await call("GET", "/api/members", { cookie: A })).data.total;
ok(antes === 4, `tem ${antes} membros, acima do teto de 2`, antes);
r = await call("GET", "/api/members", { cookie: A });
ok(r.status === 200 && r.data.total === 4, "continua LENDO os 4 membros");
r = await call("PUT", `/api/members/${r.data.records[0].id}`, { cookie: A, body: { name: "Editado", email: `edit${u}@x.test` } });
ok(r.status === 200, "continua EDITANDO o que ja existe");
r = await call("POST", "/api/members", { cookie: A, body: { name: "M9", email: `m9${u}@x.test` } });
ok(r.status === 402, "so a CRIACAO nova e barrada", r.status);
ok(/já tem 4/.test(r.data?.error || ""), "e a mensagem admite que ja tem 4", r.data?.error);

console.log("\n== o Semente REAL comporta o par que faz a igreja funcionar ==");
// A decisao da 012: com 1 assento o dono ocupava o unico e ninguem convidava a
// secretaria. Com 2, o par lider+secretaria cabe -- e o terceiro nao.
{
  const w = Date.now().toString(36) + "s";
  const reg = await call("POST", "/api/auth/register", { body: { organizationName: `Sem ${w}`, fullName: "Dona", email: `dona${w}@x.test`, password: "senha1234" } });
  const S1 = reg.cookie;
  // cai para o Semente encerrando a avaliacao: e o estado real de quem nao assina
  await db.query(`UPDATE subscriptions SET trial_ends_at = now() - interval '1 day' WHERE organization_id = $1`, [reg.data.organization.id]);
  let ss = await call("GET", "/api/auth/session", { cookie: S1 });
  ok(ss.data.plan.slug === "semente" && ss.data.plan.maxUsers === 2, "avaliacao vencida -> Semente com 2 assentos", JSON.stringify([ss.data.plan?.slug, ss.data.plan?.maxUsers]));
  ok(ss.data.plan.usage.users === 1, "a dona ocupa 1", ss.data.plan?.usage?.users);
  let cv = await call("POST", "/api/users", { cookie: S1, body: { email: `sec${w}@x.test`, fullName: "Secretaria", roleSlug: "secretaria" } });
  ok(cv.status === 201, "e ela CONSEGUE convidar a secretaria -- era isto que nao dava", `${cv.status} ${cv.data?.code || ""}`);
  cv = await call("POST", "/api/users", { cookie: S1, body: { email: `ter${w}@x.test`, fullName: "Terceiro", roleSlug: "leitura" } });
  ok(cv.status === 402 && cv.data.code === "plan_limit_reached", "o terceiro continua barrado: 2 e teto, nao porta aberta", `${cv.status} ${cv.data?.code}`);
  ok(/2 /.test(cv.data?.error || ""), "e a mensagem diz o teto novo", cv.data?.error);
}

console.log("\n== teto de USUARIOS, e o convite ocupa assento ==");
await db.query(`INSERT INTO plans (slug,name,price_cents,max_members,max_users,sort_order) VALUES ('teste-u','TesteU',0,NULL,2,9)
                ON CONFLICT (slug) DO UPDATE SET max_users=2, max_members=NULL`);
await plano(org, "teste-u");
r = await call("POST", "/api/users", { cookie: A, body: { email: `u1${u}@a.test`, fullName: "U1", roleSlug: "leitura" } });
ok(r.status === 201, "2o assento: convite pendente criado", r.status);
r = await call("POST", "/api/users", { cookie: A, body: { email: `u2${u}@a.test`, fullName: "U2", roleSlug: "leitura" } });
ok(r.status === 402 && r.data.code === "plan_limit_reached", "3o assento barrado -- o convite PENDENTE ocupou o assento", r.status + " " + JSON.stringify(r.data?.error));

console.log("\n== suspender libera assento, reativar volta a ocupar ==");
r = await call("POST", "/api/users", { cookie: A, body: { email: `u3${u}@a.test`, fullName: "U3", roleSlug: "leitura", password: "senha1234" } });
ok(r.status === 402, "criar usuario direto tambem e barrado", r.status);
// aceita o convite pendente para virar vinculo, e depois suspende
const inv = await db.query(`SELECT token_hash FROM invitations WHERE organization_id=$1 AND status='pending'`, [org]);
ok(inv.rows.length === 1, "ha 1 convite pendente ocupando assento");
await db.query(`UPDATE invitations SET status='revoked' WHERE organization_id=$1 AND status='pending'`, [org]);
r = await call("POST", "/api/users", { cookie: A, body: { email: `u4${u}@a.test`, fullName: "U4", roleSlug: "leitura", password: "senha1234" } });
ok(r.status === 201, "revogado o convite, o assento volta e o usuario entra", r.status);
const alvo = r.data.id;
r = await call("POST", "/api/users", { cookie: A, body: { email: `u5${u}@a.test`, fullName: "U5", roleSlug: "leitura", password: "senha1234" } });
ok(r.status === 402, "cheio de novo", r.status);
r = await call("PATCH", `/api/users/${alvo}`, { cookie: A, body: { status: "suspended" } });
ok(r.status === 200, "suspender nunca e barrado", r.status);
r = await call("POST", "/api/users", { cookie: A, body: { email: `u6${u}@a.test`, fullName: "U6", roleSlug: "leitura", password: "senha1234" } });
ok(r.status === 201, "suspenso libera assento", r.status);
r = await call("PATCH", `/api/users/${alvo}`, { cookie: A, body: { status: "active" } });
ok(r.status === 402 && r.data.code === "plan_limit_reached", "reativar com assentos cheios -> 402", r.status);

console.log("\n== owner NAO fura o teto ==");
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.data.role.slug === "owner", "quem esbarrou acima e owner com as 24 permissoes", r.data.role.slug);

console.log("\n== plano ilimitado nao verifica nada ==");
await plano(org, "rede");
ok((await call("POST", "/api/users", { cookie: A, body: { email: `u7${u}@a.test`, fullName: "U7", roleSlug: "leitura", password: "senha1234" } })).status === 201, "Rede: usuarios ilimitados");
ok((await call("POST", "/api/members", { cookie: A, body: { name: "M20", email: `m20${u}@x.test` } })).status === 201, "Rede: membros ilimitados");

console.log("\n== sem assinatura vigente: nao trava (anomalia de dado) ==");
await db.query(`UPDATE subscriptions SET status='canceled' WHERE organization_id=$1`, [org]);
ok((await call("POST", "/api/members", { cookie: A, body: { name: "M21", email: `m21${u}@x.test` } })).status === 201, "sem assinatura, criacao segue");

// limpeza: os planos falsos desta suite nao podem sobrar para as outras
await db.query(`UPDATE subscriptions SET plan_id=(SELECT id FROM plans WHERE slug='semente')
                WHERE plan_id IN (SELECT id FROM plans WHERE slug LIKE 'teste-%')`);
await db.query(`DELETE FROM plans WHERE slug LIKE 'teste-%'`);
await db.end();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
