const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
const jar = {};
async function call(name, method, path, { body, cookie } = {}) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const sc = res.headers.get("set-cookie");
  if (sc && name) jar[name] = sc.split(";")[0];
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const u = Date.now().toString(36);

let r = await call("a", "POST", "/api/auth/register", { body: { organizationName: `Alfa ${u}`, fullName: "Ana", email: `ana${u}@a.test`, password: "senha1234" } });
const A = jar.a;
r = await call("b", "POST", "/api/auth/register", { body: { organizationName: `Beta ${u}`, fullName: "Bruno", email: `bruno${u}@b.test`, password: "senha1234" } });
const B = jar.b;

r = await call(null, "POST", "/api/members", { cookie: A, body: { name: "Pessoa Alfa", email: `pa${u}@x.test` } });
const pessoaA = r.data.id;
r = await call(null, "POST", "/api/members", { cookie: B, body: { name: "Pessoa Beta", email: `pb${u}@x.test` } });
const pessoaB = r.data.id;

console.log("\n== organization_members.person_id: a lacuna que o documentador achou ==");
r = await call(null, "POST", "/api/users", { cookie: A, body: { email: `x${u}@a.test`, fullName: "X", roleSlug: "leitura", password: "senha1234", personId: pessoaB } });
ok(r.status === 400 && r.data.code === "cross_tenant", "POST /api/users com personId de outra igreja -> 400 cross_tenant (nao erro de FK)", r.status + " " + JSON.stringify(r.data));

r = await call(null, "POST", "/api/users", { cookie: A, body: { email: `y${u}@a.test`, fullName: "Y", roleSlug: "leitura", password: "senha1234", personId: pessoaA } });
ok(r.status === 201, "POST /api/users com personId da propria igreja -> 201", r.status + " " + JSON.stringify(r.data));
const alvo = r.data?.id;

r = await call(null, "PATCH", `/api/users/${alvo}`, { cookie: A, body: { personId: pessoaB } });
ok(r.status === 400 && r.data.code === "cross_tenant", "PATCH com personId de outra igreja -> 400 cross_tenant", r.status + " " + JSON.stringify(r.data));

r = await call(null, "PATCH", `/api/users/${alvo}`, { cookie: A, body: { personId: pessoaA } });
ok(r.status === 200, "PATCH com personId da propria igreja -> 200", r.status);

console.log("\n== redefinicao de senha pelo responsavel ==");
r = await call(null, "POST", "/api/auth/login", { body: { email: `y${u}@a.test`, password: "senha1234" } });
ok(r.status === 200, "usuario entra com a senha original", r.status);

r = await call(null, "PATCH", `/api/users/${alvo}`, { cookie: A, body: { password: "novasenha99" } });
ok(r.status === 200, "owner redefine a senha do usuario", r.status + " " + JSON.stringify(r.data));

r = await call(null, "POST", "/api/auth/login", { body: { email: `y${u}@a.test`, password: "senha1234" } });
ok(r.status === 401, "senha antiga para de funcionar", r.status);
r = await call("y", "POST", "/api/auth/login", { body: { email: `y${u}@a.test`, password: "novasenha99" } });
ok(r.status === 200, "senha nova funciona", r.status);

r = await call(null, "PATCH", `/api/users/${alvo}`, { cookie: A, body: { password: "123" } });
ok(r.status === 400 && r.data.code === "weak_password", "senha fraca na redefinicao -> 400", r.status);

const ownerA = (await call(null, "GET", "/api/auth/session", { cookie: A })).data.user.id;
r = await call(null, "PATCH", `/api/users/${ownerA}`, { cookie: A, body: { password: "outrasenha1" } });
ok(r.status === 403 && r.data.code === "self_password_reset", "owner redefinindo a PROPRIA senha -> 403", r.status + " " + JSON.stringify(r.data));

console.log("\n== a borda: usuario que acessa duas igrejas ==");
// convida o usuario 'y' (ja existente em Alfa) para Beta e aceita
r = await call(null, "POST", "/api/users", { cookie: B, body: { email: `y${u}@a.test`, fullName: "Y", roleSlug: "leitura" } });
const token = r.data?.inviteUrl?.split("/convite/")[1];
r = await call(null, "POST", "/api/auth/invite/accept", { body: { token, password: "novasenha99" } });
ok(r.status === 201, "usuario de Alfa aceita convite de Beta (agora acessa duas)", r.status + " " + JSON.stringify(r.data?.code ?? ""));

r = await call(null, "PATCH", `/api/users/${alvo}`, { cookie: A, body: { password: "maisumasenha1" } });
ok(r.status === 403 && r.data.code === "user_in_multiple_organizations", "owner NAO redefine senha de quem acessa duas igrejas -> 403", r.status + " " + JSON.stringify(r.data));

console.log("\n== planos oficiais no banco ==");
r = await call(null, "GET", "/api/auth/session", { cookie: A });
ok(r.status === 200, "sessao segue funcionando", r.status);

console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
