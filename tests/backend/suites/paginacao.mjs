const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
async function call(m, p, { body, cookie } = {}) {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || ""; const txt = await r.text();
  return { s: r.status, txt, d: ct.includes("json") ? JSON.parse(txt || "null") : null, c: r.headers.get("set-cookie")?.split(";")[0] };
}
const u = Date.now().toString(36);
let r = await call("POST", "/api/auth/register", { body: { organizationName: `Pag ${u}`, fullName: "Dono", email: `d${u}@x.test`, password: "senha1234" } });
const A = r.c;
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });
await call("POST", "/api/ministries", { cookie: A, body: { name: "Louvor" } });

// 60 membros: 20 "Ferreira" inativos, 40 "Souza" ativos. O Ferreira nº 55 mora bem depois da página 1.
for (let i = 1; i <= 60; i++) {
  const ferreira = i > 40;
  await call("POST", "/api/members", { cookie: A, body: {
    name: `${ferreira ? "Ferreira" : "Souza"} ${String(i).padStart(2, "0")}`,
    email: `m${i}-${u}@x.test`,
    status: ferreira ? "Inativo" : "Ativo",
    ministry: i % 2 === 0 ? "Louvor" : "Nenhum",
  } });
}

console.log("== o formato ==");
r = await call("GET", "/api/members", { cookie: A });
ok(Array.isArray(r.d.records), "records é array");
ok(r.d.total === 60 && r.d.page === 1 && r.d.pageSize === 25, "{ records, total, page, pageSize }", JSON.stringify({ t: r.d.total, p: r.d.page, ps: r.d.pageSize }));
ok(r.d.records.length === 25, "a página traz 25", r.d.records.length);

console.log("\n== páginas ==");
const p1 = (await call("GET", "/api/members?page=1&pageSize=10", { cookie: A })).d;
const p2 = (await call("GET", "/api/members?page=2&pageSize=10", { cookie: A })).d;
const p6 = (await call("GET", "/api/members?page=6&pageSize=10", { cookie: A })).d;
ok(p1.records.length === 10 && p2.records.length === 10, "10 por página");
ok(p1.records[0].id !== p2.records[0].id, "página 2 traz outros registros");
ok(p6.records.length === 10 && p6.total === 60, "a última página fecha em 60", `${p6.records.length}/${p6.total}`);
ok((await call("GET", "/api/members?page=99", { cookie: A })).d.records.length === 0, "página além do fim vem vazia, não erra");
ok((await call("GET", "/api/members?pageSize=9999", { cookie: A })).d.pageSize === 100, "pageSize tem teto de 100");
ok((await call("GET", "/api/members?page=0&pageSize=0", { cookie: A })).d.page === 1, "page e pageSize inválidos caem no padrão");

console.log("\n== O PONTO: o total é o FILTRADO, não o da organização ==");
r = await call("GET", "/api/members?status=Inativo", { cookie: A });
ok(r.d.total === 20, "status=Inativo -> total 20, não 60", r.d.total);
r = await call("GET", "/api/members?ministry=Louvor", { cookie: A });
ok(r.d.total === 30, "ministry=Louvor -> total 30", r.d.total);
r = await call("GET", "/api/members?status=Inativo&ministry=Louvor", { cookie: A });
ok(r.d.total === 10, "os dois juntos -> total 10", r.d.total);

console.log("\n== A BUSCA ACHA QUEM ESTÁ NA PÁGINA 3 ==");
// "Ferreira 55" é o 15º dos inativos: sem busca no servidor, ele cairia na página 5 e a tela não o acharia.
const semBusca = (await call("GET", "/api/members?pageSize=10", { cookie: A })).d;
ok(!semBusca.records.some((m) => m.name === "Ferreira 55"), "na página 1 sem busca ele NÃO aparece");
r = await call("GET", "/api/members?search=Ferreira 55&pageSize=10", { cookie: A });
ok(r.d.total === 1 && r.d.records[0].name === "Ferreira 55", "buscando pelo nome, ele aparece na página 1", `total ${r.d.total}`);
r = await call("GET", "/api/members?search=Ferreira&pageSize=10", { cookie: A });
ok(r.d.total === 20 && r.d.records.length === 10, "busca ampla: total 20, página com 10", `${r.d.total}/${r.d.records.length}`);
ok((await call("GET", "/api/members?search=Ferreira&page=2&pageSize=10", { cookie: A })).d.records.length === 10, "e a página 2 da busca traz os outros 10");
ok((await call("GET", "/api/members?search=NinguemComEsseNome", { cookie: A })).d.total === 0, "busca sem resultado -> total 0");

console.log("\n== a exportação usa OS MESMOS filtros ==");
const filtros = "status=Inativo&ministry=Louvor";
const lista = (await call("GET", `/api/members?${filtros}&pageSize=100`, { cookie: A })).d;
const csv = (await call("GET", `/api/export/members?${filtros}`, { cookie: A })).txt;
const linhasCsv = csv.replace(/^﻿/, "").split("\r\n").filter(Boolean).length - 1;
ok(linhasCsv === lista.total, `exportar o que estou vendo: CSV tem ${linhasCsv} linhas e a listagem diz total ${lista.total}`);
ok(lista.records.every((m) => csv.includes(m.name)), "e são exatamente os mesmos registros");

console.log("\n== visitantes e financeiro no mesmo formato ==");
for (let i = 1; i <= 30; i++) await call("POST", "/api/visitors", { cookie: A, body: { name: `Visita ${i}`, email: `v${i}-${u}@x.test`, invitedBy: i % 2 ? "Ana" : "Bruno" } });
r = await call("GET", "/api/visitors?pageSize=10", { cookie: A });
ok(r.d.total === 30 && r.d.records.length === 10, "visitantes paginado", `${r.d.total}/${r.d.records.length}`);
ok((await call("GET", "/api/visitors?invitedBy=Ana", { cookie: A })).d.total === 15, "e filtrado por quem convidou", 15);
for (let i = 1; i <= 30; i++) await call("POST", "/api/financeiro", { cookie: A, body: { type: i % 2 ? "income" : "expense", description: `Lanç ${i}`, category: i % 2 ? "Dízimos" : "Aluguel", amount: "10.00", transactionDate: "2026-09-06" } });
r = await call("GET", "/api/financeiro?pageSize=10", { cookie: A });
ok(r.d.total === 30 && r.d.records.length === 10, "financeiro paginado", `${r.d.total}/${r.d.records.length}`);
ok((await call("GET", "/api/financeiro?type=Entrada", { cookie: A })).d.total === 15, "e filtrado por tipo", 15);
const lancId = r.d.records[0].id;
await call("DELETE", `/api/financeiro/${lancId}`, { cookie: A });
ok((await call("GET", "/api/financeiro", { cookie: A })).d.total === 29, "excluído sai do total da listagem", 29);
ok((await call("GET", "/api/financeiro?deleted=1", { cookie: A })).d.total === 1, "e entra no total da lixeira", 1);

console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
