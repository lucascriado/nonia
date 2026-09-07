// A aba "Recentes" deriva da DATA da visita, não da marca is_recent.
import pg from "/home/lucas/www/nonia-auth/node_modules/pg/lib/index.js";
const BASE = "http://127.0.0.1:3210";
const DB = "postgresql://nonia:nonia@127.0.0.1:54329/nonia";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
async function call(m, p, { body, cookie } = {}) {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null,
           t: ct.includes("json") ? null : await r.text().catch(() => null), c: r.headers.get("set-cookie")?.split(";")[0] };
}
const sql = new pg.Client({ connectionString: DB }); await sql.connect();
// O fuso da sessão precisa ser o MESMO da aplicação, senão a suíte mede a
// diferença entre as duas conexões em vez de medir a regra. O Sequelize aplica
// UTC em toda conexão (lib/db.ts não define fuso, e o padrão dele é +00:00);
// um cliente pg cru herda o fuso do servidor, que no Postgres efêmero é
// America/Sao_Paulo. Entre 21h e meia-noite em Brasília, CURRENT_DATE difere
// em UM DIA entre os dois -- e a fronteira exata da janela virava falha.
await sql.query("SET TIME ZONE 'UTC'");
const u = Date.now().toString(36);
let r = await call("POST", "/api/auth/register", { body: { organizationName: `Rec ${u}`, fullName: "Dono", email: `d${u}@x.test`, password: "senha1234" } });
const A = r.c; const org = r.d.organization.id;
ok(r.s === 201, "cadastro", r.s);

console.log("\n== a fronteira da janela: 14 dias ==");
// Todos criados hoje; a data recua por SQL, que é a única forma de simular
// tempo passando. A marca is_recent fica como a criação a deixou.
const dias = [0, 7, 13, 14, 15, 20, 40];
for (const d of dias) {
  const res = await call("POST", "/api/visitors", { cookie: A, body: { name: `V${d}`, email: `v${d}-${u}@x.test` } });
  ok(res.s === 201, `criado V${d}`, res.s);
  await sql.query(`UPDATE visitors SET visit_date = (CURRENT_DATE - ($2 || ' days')::interval)::date
                    WHERE organization_id = $1 AND person_id = $3`, [org, String(d), res.d.id]);
}
const nomes = async (q) => ((await call("GET", `/api/visitors?pageSize=100${q}`, { cookie: A })).d.records || []).map((x) => x.name).sort();
let n = await nomes("&tab=Recentes");
ok(JSON.stringify(n) === JSON.stringify(["V0", "V13", "V14", "V7"]), "Recentes = 0, 7, 13 e 14 dias", JSON.stringify(n));
ok(!n.includes("V15"), "15 dias fica de fora: a fronteira é fechada em 14", JSON.stringify(n));
ok((await nomes("&tab=Todos")).length === 7, "e a aba Todos continua com os 7", "");

console.log("\n== a marca não manda mais: os dois sentidos ==");
// Antigo e MARCADO como recente -- era exatamente este o defeito.
await sql.query(`UPDATE visitors SET is_recent = true WHERE organization_id = $1`, [org]);
n = await nomes("&tab=Recentes");
ok(!n.includes("V40") && !n.includes("V20") && !n.includes("V15"),
   "com TODOS marcados is_recent=true, os antigos continuam fora", JSON.stringify(n));
ok(n.length === 4, "a aba não virou uma segunda 'Todos'", n.length);
// Recente e marcado como NÃO recente.
await sql.query(`UPDATE visitors SET is_recent = false WHERE organization_id = $1`, [org]);
n = await nomes("&tab=Recentes");
ok(n.length === 4 && n.includes("V0"), "com TODOS marcados false, os recentes continuam dentro", JSON.stringify(n));
ok(JSON.stringify(n) === JSON.stringify(["V0", "V13", "V14", "V7"]), "ou seja: a aba lê a data, e só a data", JSON.stringify(n));

console.log("\n== a janela anda sozinha com o tempo ==");
await sql.query(`UPDATE visitors SET visit_date = (CURRENT_DATE - interval '14 days')::date
                  WHERE organization_id = $1 AND person_id IN (SELECT id FROM people WHERE organization_id = $1)`, [org]);
ok((await nomes("&tab=Recentes")).length === 7, "todos com 14 dias -> todos recentes", "");
await sql.query(`UPDATE visitors SET visit_date = (CURRENT_DATE - interval '15 days')::date WHERE organization_id = $1`, [org]);
ok((await nomes("&tab=Recentes")).length === 0, "e um dia depois, nenhum -- sem ninguém rodar nada", "");
ok((await nomes("&tab=Todos")).length === 7, "sem sumir da lista: saiu da ABA, não do cadastro", "");

console.log("\n== o indicador da faixa acompanha a aba ==");
await sql.query(`UPDATE visitors SET visit_date = CURRENT_DATE WHERE organization_id = $1`, [org]);
const rec = (await call("GET", "/api/visitors?pageSize=1&tab=Recentes", { cookie: A })).d;
ok(rec.total === 7 && rec.summary.firstVisit === 7, "Recentes: total e indicador conferem", `${rec.total}/${rec.summary?.firstVisit}`);
await sql.query(`UPDATE visitors SET visit_date = (CURRENT_DATE - interval '90 days')::date WHERE organization_id = $1`, [org]);
const vaz = (await call("GET", "/api/visitors?pageSize=1&tab=Recentes", { cookie: A })).d;
ok(vaz.total === 0 && vaz.summary.firstVisit === 0 && vaz.summary.integrating === 0 && vaz.summary.markedAsMember === 0,
   "aba vazia zera o indicador junto, sem quebrar", JSON.stringify(vaz.summary));

console.log("\n== as marcas sumiram do contrato da API ==");
const vis = (await call("GET", "/api/visitors?pageSize=1", { cookie: A })).d.records[0];
ok(!("recent" in vis), "listagem de visitantes não devolve mais `recent`", JSON.stringify(Object.keys(vis)));
const vid = (await call("GET", `/api/visitors/${(await call("GET", "/api/visitors?pageSize=1", { cookie: A })).d.records[0].id}`, { cookie: A })).d;
ok(!("recent" in (vid.visitor ?? vid)), "e o visitante por id também não", JSON.stringify(Object.keys(vid.visitor ?? vid)));
r = await call("POST", "/api/members", { cookie: A, body: { name: "Membro Um", email: `m${u}@x.test` } });
ok(r.s === 201, "membro criado", r.s);
const mem = (await call("GET", "/api/members?pageSize=1", { cookie: A })).d.records[0];
ok(!("isNew" in mem), "listagem de membros não devolve mais `isNew`", JSON.stringify(Object.keys(mem)));
const mid = (await call("GET", `/api/members/${mem.id}`, { cookie: A })).d;
ok(!("isNew" in (mid.member ?? mid)), "e o membro por id também não", JSON.stringify(Object.keys(mid.member ?? mid)));

console.log("\n== e nunca prometeram nada no CSV ==");
const csvV = (await call("GET", "/api/export/visitors", { cookie: A })).t || "";
const csvM = (await call("GET", "/api/export/members", { cookie: A })).t || "";
const cab = (c) => (c.split("\r\n")[0] || "").replace(/^﻿/, "");
ok(!/Recente/i.test(cab(csvV)), "CSV de visitantes não tem coluna de marca", cab(csvV).slice(0, 90));
ok(/Data da visita/.test(cab(csvV)), "ele leva a DATA da visita, que é o fato", "");
ok(!/\bNovo\b/i.test(cab(csvM)), "CSV de membros não tem coluna de marca", cab(csvM).slice(0, 90));
ok(/Data de admiss/.test(cab(csvM)), "ele leva a DATA de admissão, que é o fato", "");

console.log("\n== as colunas continuam no banco, e agora ninguém as grava ==");
const col = await sql.query(`SELECT column_name FROM information_schema.columns
                              WHERE table_name IN ('members','visitors') AND column_name IN ('is_new','is_recent')
                              ORDER BY column_name`);
ok(col.rowCount === 2, "is_new e is_recent seguem no schema (órfãs invisíveis, sem migration)", col.rowCount);
r = await call("POST", "/api/visitors", { cookie: A, body: { name: "Novo Vis", email: `nv${u}@x.test` } });
const grav = await sql.query(`SELECT is_recent FROM visitors WHERE person_id = $1`, [r.d.id]);
ok(grav.rows[0].is_recent === true, "visitante novo fica no DEFAULT da coluna, sem o código mandar valor", grav.rows[0]?.is_recent);

await sql.end();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
