const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
async function call(m, p, { body, cookie } = {}) {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null, c: r.headers.get("set-cookie")?.split(";")[0] };
}
const u = Date.now().toString(36);
let r = await call("POST", "/api/auth/register", { body: { organizationName: `Res ${u}`, fullName: "Dono", email: `d${u}@x.test`, password: "senha1234", document: "11.222.333/0001-81" } });
const A = r.c;
ok(r.s === 201, "cadastro com CNPJ válido", r.s);
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });

console.log("== CNPJ e CPF no cadastro ==");
r = await call("GET", "/api/organization", { cookie: A });
ok(r.d.document === "11.222.333/0001-81", "guardado no formato canônico", r.d.document);
r = await call("POST", "/api/auth/register", { body: { organizationName: "X", fullName: "X", email: `x1${u}@x.test`, password: "senha1234", document: "11.222.333/0001-82" } });
ok(r.s === 400 && r.d.code === "invalid_document", "dígito errado -> 400 invalid_document", `${r.s} ${r.d?.code}`);
r = await call("POST", "/api/auth/register", { body: { organizationName: "X", fullName: "X", email: `x2${u}@x.test`, password: "senha1234", document: "12ABC34501DE35" } });
ok(r.s === 201, "CNPJ ALFANUMÉRICO (emitido desde 31/07/2026) é ACEITO", `${r.s} ${r.d?.code}`);
r = await call("POST", "/api/auth/register", { body: { organizationName: "X", fullName: "X", email: `x3${u}@x.test`, password: "senha1234", document: "52998224725" } });
ok(r.s === 201, "CPF também vale: igreja registrada na pessoa física", r.s);
r = await call("POST", "/api/auth/register", { body: { organizationName: "X", fullName: "X", email: `x4${u}@x.test`, password: "senha1234" } });
ok(r.s === 201, "e o documento continua OPCIONAL no cadastro", r.s);
r = await call("PATCH", "/api/organization", { cookie: A, body: { document: "1234" } });
ok(r.s === 400 && r.d.code === "invalid_document", "edição também valida", `${r.s} ${r.d?.code}`);
r = await call("PATCH", "/api/organization", { cookie: A, body: { document: "52998224725" } });
ok(r.s === 200 && r.d.document === "529.982.247-25", "e formata o que entra sem pontuação", r.d?.document);

console.log("\n== o somatório do financeiro ==");
const lancs = [
  ["income", "Dízimos", "10000.00", "paid"], ["income", "Ofertas", "2500.50", "paid"],
  ["expense", "Aluguel", "3800.00", "paid"], ["expense", "Materiais", "200.50", "paid"],
  ["income", "Eventos", "1500.00", "pending"], ["expense", "Missões", "900.00", "pending"],
];
for (const [tipo, cat, valor, st] of lancs) {
  await call("POST", "/api/financeiro", { cookie: A, body: { type: tipo, description: `${cat} ${u}`, category: cat, amount: valor, status: st, transactionDate: "2026-09-06" } });
}
r = await call("GET", "/api/financeiro", { cookie: A });
const s0 = r.d.summary;
ok(s0.income === "12500.50", "entradas pagas somam 12500,50", s0?.income);
ok(s0.expense === "4000.50", "saídas pagas somam 4000,50", s0?.expense);
ok(s0.balance === "8500.00", "saldo = entradas - saídas = 8500,00", s0?.balance);
ok(s0.pendingCount === 2 && s0.pendingAmount === "2400.00", "pendências: 2 lançamentos, 2400,00", JSON.stringify([s0?.pendingCount, s0?.pendingAmount]));
ok(r.d.total === 6, "e o total continuando ao lado", r.d.total);

console.log("\n== O PONTO: o somatório ACOMPANHA o filtro ==");
r = await call("GET", "/api/financeiro?type=Entrada", { cookie: A });
ok(r.d.summary.income === "12500.50" && r.d.summary.expense === "0" && r.d.total === 3, "só entradas: saídas zeram", JSON.stringify(r.d.summary));
r = await call("GET", "/api/financeiro?category=Aluguel", { cookie: A });
ok(r.d.summary.expense === "3800.00" && r.d.summary.balance === "-3800.00", "só Aluguel: saldo negativo, e negativo aparece", r.d.summary?.balance);
r = await call("GET", "/api/financeiro?status=Pendente", { cookie: A });
ok(r.d.summary.income === "0" && r.d.summary.pendingCount === 2, "só pendentes: nada pago no somatório", JSON.stringify(r.d.summary));

console.log("\n== e NÃO é a soma da página ==");
r = await call("GET", "/api/financeiro?pageSize=2", { cookie: A });
ok(r.d.records.length === 2, "página com 2 registros", r.d.records.length);
ok(r.d.summary.income === "12500.50" && r.d.total === 6, "mas o somatório é dos 6, não dos 2 visíveis", JSON.stringify([r.d.summary.income, r.d.total]));

console.log("\n== excluído não entra no somatório ==");
const todos = (await call("GET", "/api/financeiro?pageSize=100", { cookie: A })).d.records;
const alvo = todos.find((x) => x.type === "income" && x.status === "paid");
await call("DELETE", `/api/financeiro/${alvo.id}`, { cookie: A });
r = await call("GET", "/api/financeiro", { cookie: A });
ok(Number(r.d.summary.income) < 12500.50, "entradas caíram ao excluir um lançamento pago", r.d.summary?.income);
await call("POST", `/api/financeiro/${alvo.id}/restore`, { cookie: A });
r = await call("GET", "/api/financeiro", { cookie: A });
ok(r.d.summary.income === "12500.50", "e voltaram ao restaurar", r.d.summary?.income);

console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
