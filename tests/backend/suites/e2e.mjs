import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;

const ok = (cond, label, extra = "") => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FALHA ${label} ${extra}`); }
};

const jar = {};
async function call(name, method, path, { body, cookie, redirect = "manual" } = {}) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie && name) {
    const value = setCookie.split(";")[0];
    jar[name] = value.endsWith("=") ? null : value;
  }
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, location: res.headers.get("location") };
}

const section = (t) => console.log(`\n== ${t}`);

// ---------------------------------------------------------------- cadastro
section("Cadastro e sessão");
let r = await call("a", "POST", "/api/auth/register", {
  body: { organizationName: "Igreja Alfa", fullName: "Ana Owner", email: "ana@alfa.test", password: "senha1234" },
});
ok(r.status === 201, "cadastro cria organização + owner", r.status);
ok(r.data?.role?.slug === "owner", "papel owner", r.data?.role?.slug);
{
  const { Client } = require("/home/lucas/www/nonia-auth/node_modules/pg");
  const c = new Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/nonia" });
  await c.connect();
  const total = (await c.query("SELECT count(*)::int n FROM permissions")).rows[0].n;
  await c.end();
  ok(r.data?.permissions?.length === total,
     `owner com TODAS as permissões que existem (${total})`, r.data?.permissions?.length);
}
ok(r.data?.organization?.slug === "igreja-alfa", "slug gerado do nome", r.data?.organization?.slug);
ok(Boolean(jar.a), "cookie httpOnly emitido");

r = await call(null, "GET", "/api/auth/session", { cookie: jar.a });
ok(r.status === 200 && r.data.authenticated === true, "GET /api/auth/session autenticado", r.status);

r = await call(null, "GET", "/api/auth/session");
ok(r.status === 200 && r.data.authenticated === false, "sessão sem cookie responde 200 authenticated:false", r.status);

r = await call(null, "POST", "/api/auth/register", {
  body: { organizationName: "Outra", fullName: "X", email: "ana@alfa.test", password: "senha1234" },
});
ok(r.status === 409 && r.data.code === "email_taken", "e-mail repetido -> 409 email_taken", r.status);

r = await call(null, "POST", "/api/auth/register", {
  body: { organizationName: "Fraca", fullName: "X", email: "fraca@x.test", password: "123" },
});
ok(r.status === 400 && r.data.code === "weak_password", "senha fraca -> 400 weak_password", r.status);

// ------------------------------------------------------------- isolamento
section("Isolamento entre organizações");
r = await call("b", "POST", "/api/auth/register", {
  body: { organizationName: "Igreja Beta", fullName: "Bruno Owner", email: "bruno@beta.test", password: "senha1234" },
});
ok(r.status === 201, "segunda organização criada", r.status);

r = await call(null, "POST", "/api/members", {
  cookie: jar.a,
  body: { name: "Membro Alfa", email: "membro@compartilhado.test", cell: "Sem célula" },
});
ok(r.status === 201, "Alfa cria membro", r.status);
const memberA = r.data?.id;

r = await call(null, "POST", "/api/members", {
  cookie: jar.b,
  body: { name: "Membro Beta", email: "membro@compartilhado.test", cell: "Sem célula" },
});
ok(r.status === 201, "Beta cria membro com o MESMO e-mail (unique por tenant)", r.status);

r = await call(null, "GET", "/api/members", { cookie: jar.a });
ok(r.status === 200 && r.data.total === 1 && r.data.records[0].name === "Membro Alfa", "Alfa vê só o próprio membro", JSON.stringify(r.data?.records?.map?.(m => m.name)));

r = await call(null, "GET", "/api/members", { cookie: jar.b });
ok(r.status === 200 && r.data.total === 1 && r.data.records[0].name === "Membro Beta", "Beta vê só o próprio membro", JSON.stringify(r.data?.records?.map?.(m => m.name)));

r = await call(null, "PUT", `/api/members/${memberA}`, {
  cookie: jar.b,
  body: { name: "Sequestrado", email: "hack@beta.test" },
});
ok(r.status === 404, "Beta editando membro de Alfa -> 404", r.status);

r = await call(null, "DELETE", `/api/members/${memberA}`, { cookie: jar.b });
ok(r.status === 404, "Beta excluindo membro de Alfa -> 404", r.status);

r = await call(null, "GET", "/api/members", { cookie: jar.a });
ok(r.data?.records?.[0]?.name === "Membro Alfa", "membro de Alfa intacto depois das tentativas");

r = await call(null, "POST", "/api/cells", {
  cookie: jar.b,
  body: { name: "Célula Invasora", leaderId: memberA },
});
ok(r.status === 400 && r.data.code === "cross_tenant", "leaderId de outra organização -> 400 cross_tenant", r.status + " " + JSON.stringify(r.data));

r = await call(null, "GET", "/api/dashboard", { cookie: jar.b });
ok(r.data?.stats?.totalMembers === 1, "dashboard de Beta conta só o tenant dele", r.data?.stats?.totalMembers);

// ------------------------------------------------------------------ login
section("Login, bloqueio e logout");
for (let i = 1; i <= 5; i++) {
  r = await call(null, "POST", "/api/auth/login", { body: { email: "bruno@beta.test", password: "errada99" } });
  if (i < 5) ok(r.status === 401 && r.data.code === "invalid_credentials", `tentativa ${i} -> 401`, r.status);
  else ok(r.status === 401, `tentativa ${i} -> 401 (quinta falha tranca)`, r.status);
}
r = await call(null, "POST", "/api/auth/login", { body: { email: "bruno@beta.test", password: "senha1234" } });
ok(r.status === 429 && r.data.code === "too_many_attempts", "senha certa após 5 falhas -> 429 too_many_attempts", r.status);

r = await call(null, "POST", "/api/auth/login", { body: { email: "naoexiste@x.test", password: "qualquer1" } });
ok(r.status === 401 && r.data.code === "invalid_credentials", "e-mail inexistente -> mesmo 401 (sem enumeração)", r.status);

r = await call("a2", "POST", "/api/auth/login", { body: { email: "ana@alfa.test", password: "senha1234" } });
ok(r.status === 200 && r.data.authenticated, "login válido -> 200 + cookie", r.status);

r = await call("a2", "POST", "/api/auth/logout", { cookie: jar.a2 });
ok(r.status === 200, "logout -> 200", r.status);
r = await call(null, "GET", "/api/members", { cookie: jar.a2 ?? "nonia_session=x" });
ok(r.status === 401, "sessão revogada não acessa mais", r.status);

// --------------------------------------------------------------- convites
section("Convite e permissões");
r = await call(null, "POST", "/api/users", {
  cookie: jar.a,
  body: { email: "leitor@alfa.test", fullName: "Leo Leitura", roleSlug: "leitura" },
});
ok(r.status === 201 && r.data.inviteUrl, "convite criado com URL de aceite", r.status);
const token = r.data?.inviteUrl?.split("/convite/")[1];

r = await call(null, "GET", `/api/auth/invite?token=${token}`);
ok(r.status === 200 && r.data.organizationName === "Igreja Alfa", "consulta pública do convite", JSON.stringify(r.data));

r = await call(null, "GET", "/api/auth/invite?token=inventado");
ok(r.status === 404, "token inválido -> 404", r.status);

r = await call("leitor", "POST", "/api/auth/invite/accept", {
  body: { token, fullName: "Leo Leitura", password: "senha1234" },
});
ok(r.status === 201 && r.data.role.slug === "leitura", "aceite cria usuário e abre sessão", r.status);

r = await call(null, "GET", "/api/members", { cookie: jar.leitor });
ok(r.status === 200 && r.data.total === 1, "leitura consegue LER membros", r.status);

r = await call(null, "POST", "/api/members", {
  cookie: jar.leitor,
  body: { name: "Nao Deve Entrar", email: "nao@alfa.test" },
});
ok(r.status === 403 && r.data.code === "missing_permission", "leitura NÃO consegue criar membro -> 403", r.status);

r = await call(null, "GET", "/api/financeiro", { cookie: jar.leitor });
ok(r.status === 403, "leitura não acessa o financeiro -> 403", r.status);

r = await call(null, "POST", "/api/users", {
  cookie: jar.leitor,
  body: { email: "outro@alfa.test", fullName: "Outro", roleSlug: "admin" },
});
ok(r.status === 403, "leitura não convida ninguém -> 403", r.status);

r = await call(null, "GET", "/api/users", { cookie: jar.a });
ok(r.status === 200 && r.data.users.length === 2, "owner lista os 2 usuários da organização", r.data?.users?.length);

// ------------------------------------------------------------- middleware
section("Middleware");
r = await call(null, "GET", "/membros");
ok(r.status === 307 && r.location?.includes("/entrar"), "tela do app sem cookie -> redireciona para /entrar", r.status + " " + r.location);
r = await call(null, "GET", "/");
ok(r.status === 200, "landing pública sem cookie -> 200", r.status);
r = await call(null, "GET", "/", { cookie: jar.a });
ok(r.status === 307 && r.location?.endsWith("/painel"), "landing com sessão -> /painel", r.status + " " + r.location);
r = await call(null, "GET", "/entrar", { cookie: jar.a });
ok(r.status === 307 && r.location?.endsWith("/painel"), "/entrar com sessão -> /painel", r.status + " " + r.location);
r = await call(null, "GET", "/api/members");
ok(r.status === 401, "API sem cookie -> 401 no Edge", r.status);

console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
