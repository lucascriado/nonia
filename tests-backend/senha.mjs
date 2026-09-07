const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
async function call(method, path, { body, cookie } = {}) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const sc = res.headers.get("set-cookie");
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data, cookie: sc?.split(";")[0] };
}
const u = Date.now().toString(36);
const email = `troca${u}@a.test`;

let r = await call("POST", "/api/auth/register", { body: { organizationName: `Alfa ${u}`, fullName: "Ana", email, password: "senha1234" } });
const antigo = r.cookie;
ok(r.status === 201, "cadastro", r.status);

console.log("\n== guardas ==");
r = await call("POST", "/api/auth/password", { body: { currentPassword: "senha1234", newPassword: "nova12345" } });
ok(r.status === 401 && r.data.code === "unauthenticated", "sem sessao -> 401 unauthenticated (barrado no proxy)", r.status + " " + JSON.stringify(r.data));

r = await call("POST", "/api/auth/password", { cookie: antigo, body: { newPassword: "nova12345" } });
ok(r.status === 400, "sem a senha atual -> 400", r.status + " " + JSON.stringify(r.data));

r = await call("POST", "/api/auth/password", { cookie: antigo, body: { currentPassword: "senha1234", newPassword: "123" } });
ok(r.status === 400 && r.data.code === "weak_password", "senha nova fraca -> 400 weak_password", r.status);

r = await call("POST", "/api/auth/password", { cookie: antigo, body: { currentPassword: "errada999", newPassword: "nova12345" } });
ok(r.status === 401 && r.data.code === "invalid_credentials", "senha atual errada -> 401 invalid_credentials (mesmo do login)", r.status + " " + JSON.stringify(r.data));

console.log("\n== a troca em si ==");
// segunda sessao aberta, para provar que ela morre
const outra = (await call("POST", "/api/auth/login", { body: { email, password: "senha1234" } })).cookie;
ok(Boolean(outra), "segunda sessao aberta no outro dispositivo");
ok((await call("GET", "/api/members", { cookie: outra })).status === 200, "segunda sessao funciona antes da troca");

r = await call("POST", "/api/auth/password", { cookie: antigo, body: { currentPassword: "senha1234", newPassword: "nova12345" } });
ok(r.status === 200 && r.data.ok === true, "troca -> 200 {ok:true}", r.status + " " + JSON.stringify(r.data));
ok(Boolean(r.cookie) && r.cookie !== antigo, "cookie NOVO emitido na resposta (token rotacionado)");
const novo = r.cookie;

ok((await call("GET", "/api/members", { cookie: novo })).status === 200, "quem trocou continua logado, com o cookie novo");
ok((await call("GET", "/api/members", { cookie: antigo })).status === 401, "o cookie ANTIGO de quem trocou morreu");
ok((await call("GET", "/api/members", { cookie: outra })).status === 401, "a sessao do OUTRO dispositivo morreu");

ok((await call("POST", "/api/auth/login", { body: { email, password: "senha1234" } })).status === 401, "senha antiga nao entra mais");
ok((await call("POST", "/api/auth/login", { body: { email, password: "nova12345" } })).status === 200, "senha nova entra");

console.log("\n== nao confundir com o socorro do PATCH ==");
const me = (await call("GET", "/api/auth/session", { cookie: novo })).data.user.id;
r = await call("PATCH", `/api/users/${me}`, { cookie: novo, body: { password: "outra12345" } });
ok(r.status === 403 && r.data.code === "self_password_reset", "PATCH na propria senha continua 403 self_password_reset", r.status);
ok(!/\/api\/|POST|GET|PUT|PATCH/.test(String(r.data.error)) && /alterar senha/.test(String(r.data.error)),
   "e a mensagem esta em linguagem de tela, sem endereco de API", r.data.error);

console.log("\n== usuario que acessa DUAS igrejas ==");
const outraOrg = await call("POST", "/api/auth/register", { body: { organizationName: `Beta ${u}`, fullName: "Bruno", email: `bru${u}@b.test`, password: "senha1234" } });
r = await call("POST", "/api/users", { cookie: outraOrg.cookie, body: { email, fullName: "Ana", roleSlug: "leitura" } });
const token = r.data?.inviteUrl?.split("/convite/")[1];
r = await call("POST", "/api/auth/invite/accept", { body: { token, password: "nova12345" } });
ok(r.status === 201, "Ana aceita convite de Beta (agora acessa duas)", r.status);
const emDuas = r.cookie;

r = await call("PATCH", `/api/users/${me}`, { cookie: outraOrg.cookie, body: { password: "hackeada1" } });
ok(r.status === 403 && r.data.code === "user_in_multiple_organizations", "owner de Beta NAO redefine a senha dela -> 403", r.status);

r = await call("POST", "/api/auth/password", { cookie: emDuas, body: { currentPassword: "nova12345", newPassword: "terceira12" } });
ok(r.status === 200, "mas ELA MESMA troca a propria senha -> 200 (resolve parcialmente a lacuna)", r.status + " " + JSON.stringify(r.data));
ok((await call("POST", "/api/auth/login", { body: { email, password: "terceira12" } })).status === 200, "e entra com a senha nova");

console.log("\n== trava de forca bruta ==");
const s = (await call("POST", "/api/auth/login", { body: { email, password: "terceira12" } })).cookie;
for (let i = 1; i <= 5; i++) await call("POST", "/api/auth/password", { cookie: s, body: { currentPassword: "chute0000", newPassword: "nova99999" } });
r = await call("POST", "/api/auth/password", { cookie: s, body: { currentPassword: "terceira12", newPassword: "nova99999" } });
ok(r.status === 429 && r.data.code === "too_many_attempts", "5 erros na senha atual -> 429 too_many_attempts", r.status + " " + JSON.stringify(r.data));

console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
