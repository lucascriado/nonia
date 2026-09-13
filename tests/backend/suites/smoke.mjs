const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok   ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };

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

let r = await call("a", "POST", "/api/auth/login", { body: { email: "ana@alfa.test", password: "senha1234" } });
const A = jar.a;
r = await call("b", "POST", "/api/auth/register", { body: { organizationName: "Igreja Delta", fullName: "Del", email: "del@delta.test", password: "senha1234" } });
const B = jar.b;
console.log(`\n== Ministérios`);
r = await call(null, "POST", "/api/ministries", { cookie: A, body: { name: "Louvor", color: "blue" } });
ok(r.status === 201, "Alfa cria ministério", r.status); const minA = r.data?.id;
r = await call(null, "POST", "/api/ministries", { cookie: B, body: { name: "Louvor", color: "blue" } });
ok(r.status === 201, "Delta cria ministério de MESMO nome (unique por tenant)", r.status);
r = await call(null, "GET", "/api/ministries", { cookie: A });
ok(r.data?.ministries?.length === 1, "Alfa vê 1 ministério", r.data?.ministries?.length);
r = await call(null, "PUT", `/api/ministries/${minA}`, { cookie: B, body: { name: "Invadido" } });
ok(r.status === 404, "Delta editando ministério de Alfa -> 404", r.status);
r = await call(null, "DELETE", `/api/ministries/${minA}`, { cookie: B });
ok(r.status === 404, "Delta excluindo ministério de Alfa -> 404", r.status);

console.log(`\n== Células`);
r = await call(null, "POST", "/api/cells", { cookie: A, body: { name: "Célula Central", meetingDay: "Quarta" } });
ok(r.status === 201, "Alfa cria célula", r.status); const cellA = r.data?.id;
r = await call(null, "POST", "/api/cells", { cookie: B, body: { name: "Célula Central" } });
ok(r.status === 201, "Delta cria célula de MESMO nome", r.status);
r = await call(null, "GET", "/api/cells", { cookie: B });
ok(r.data?.length === 1, "Delta vê só a própria célula", r.data?.length);
r = await call(null, "PUT", `/api/cells/${cellA}`, { cookie: B, body: { name: "Invadida" } });
ok(r.status === 404, "Delta editando célula de Alfa -> 404", r.status);
r = await call(null, "DELETE", `/api/cells/${cellA}`, { cookie: B });
ok(r.status === 404, "Delta excluindo célula de Alfa -> 404", r.status);

console.log(`\n== Visitantes`);
r = await call(null, "POST", "/api/visitors", { cookie: A, body: { name: "Vitor Visita", email: "vitor@x.test", membershipStage: "Contato realizado" } });
ok(r.status === 201, "Alfa cria visitante", r.status); const visA = r.data?.id;
r = await call(null, "GET", "/api/visitors", { cookie: B });
ok(r.data?.total === 0, "Delta não vê visitante de Alfa", r.data?.total);
r = await call(null, "PUT", `/api/visitors/${visA}`, { cookie: B, body: { name: "X", email: "x@x.test" } });
ok(r.status === 404, "Delta editando visitante de Alfa -> 404", r.status);
r = await call(null, "POST", `/api/visitors/${visA}/convert`, { cookie: B });
ok(r.status === 404, "Delta convertendo visitante de Alfa -> 404", r.status);
r = await call(null, "POST", `/api/visitors/${visA}/convert`, { cookie: A });
ok(r.status === 200, "Alfa converte o próprio visitante", r.status);

console.log(`\n== Chamada de presença`);
r = await call(null, "GET", `/api/ministries/${minA}/attendance`, { cookie: A });
ok(r.status === 200, "Alfa lê chamada do próprio ministério", r.status);
r = await call(null, "GET", `/api/ministries/${minA}/attendance`, { cookie: B });
ok(r.status === 404, "Delta lendo chamada de Alfa -> 404", r.status);
r = await call(null, "POST", `/api/ministries/${minA}/attendance`, { cookie: B, body: { date: "2026-09-06", records: [] } });
ok(r.status === 404, "Delta gravando chamada em Alfa -> 404", r.status);

console.log(`\n== Agenda`);
r = await call(null, "POST", "/api/events", { cookie: A, body: { title: "Culto", location: "Templo", startsAt: "2026-10-01T19:00:00Z" } });
ok(r.status === 201, "Alfa cria evento", r.status); const evA = r.data?.id;
r = await call(null, "GET", "/api/events", { cookie: B });
ok(r.data?.length === 0, "Delta não vê evento de Alfa", r.data?.length);
r = await call(null, "DELETE", `/api/events?id=${evA}`, { cookie: B });
ok(r.status === 404, "Delta excluindo evento de Alfa -> 404", r.status);

console.log(`\n== Financeiro`);
r = await call(null, "POST", "/api/financeiro", { cookie: A, body: { type: "income", description: "Dízimos", category: "Dízimos", amount: "100.00", transactionDate: "2026-09-01" } });
ok(r.status === 201, "Alfa lança entrada", r.status); const finA = r.data?.id;
r = await call(null, "GET", "/api/financeiro", { cookie: B });
ok(r.data?.total === 0, "Delta não vê lançamento de Alfa", r.data?.total);
r = await call(null, "PUT", `/api/financeiro/${finA}`, { cookie: B, body: { type: "income", description: "X", category: "Ofertas", amount: "1.00", transactionDate: "2026-09-01" } });
ok(r.status === 404, "Delta editando lançamento de Alfa -> 404", r.status);
r = await call(null, "DELETE", `/api/financeiro/${finA}`, { cookie: B });
ok(r.status === 404, "Delta excluindo lançamento de Alfa -> 404", r.status);

console.log(`\n== Atividades, papéis e dashboard`);
r = await call(null, "GET", "/api/activities", { cookie: B });
ok(r.status === 200 && r.data.records.every(x => !String(x.subject).includes("Alfa")), "atividades de Delta não trazem nada de Alfa", r.data?.total);
r = await call(null, "GET", "/api/activities", { cookie: A });
ok(r.status === 200 && r.data.total > 0, "Alfa vê o próprio histórico", r.data?.total);
r = await call(null, "GET", "/api/roles", { cookie: A });
ok(r.status === 200 && r.data.length === 5, "5 papéis do sistema disponíveis", r.data?.length);
r = await call(null, "GET", "/api/dashboard", { cookie: A });
ok(r.status === 200 && typeof r.data.stats.totalMembers === "number", "dashboard responde", r.status);

console.log(`\n== Troca de organização`);
r = await call(null, "POST", "/api/auth/switch", { cookie: A, body: { organizationSlug: "igreja-delta" } });
ok(r.status === 403 && r.data.code === "organization_not_allowed", "trocar para organização sem vínculo -> 403", r.status);

console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
