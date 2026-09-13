// Os indicadores das listagens de membros e visitantes: vêm na resposta da
// listagem, na MESMA consulta do total e sob o MESMO filtro.
import pg from "/home/lucas/www/nonia-auth/node_modules/pg/lib/index.js";
const BASE = "http://127.0.0.1:3210";
const DB = "postgresql://nonia:nonia@127.0.0.1:54329/nonia";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
async function call(m, p, { body, cookie } = {}) {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null, c: r.headers.get("set-cookie")?.split(";")[0] };
}
const sql = new pg.Client({ connectionString: DB });
await sql.connect();
// O fuso da sessão precisa ser o MESMO da aplicação, senão a suíte mede a
// diferença entre as duas conexões em vez de medir a regra. O Sequelize aplica
// UTC em toda conexão (lib/db.ts não define fuso, e o padrão dele é +00:00);
// um cliente pg cru herda o fuso do servidor, que no Postgres efêmero é
// America/Sao_Paulo. Entre 21h e meia-noite em Brasília, CURRENT_DATE difere
// em UM DIA entre os dois -- e a fronteira exata da janela virava falha.
await sql.query("SET TIME ZONE 'UTC'");

const u = Date.now().toString(36);
let r = await call("POST", "/api/auth/register", { body: { organizationName: `Cont ${u}`, fullName: "Dono", email: `d${u}@x.test`, password: "senha1234" } });
const A = r.c;
ok(r.s === 201, "cadastro", r.s);
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });
const orgId = (await call("GET", "/api/organization", { cookie: A })).d.id;

// Dois ministérios, para provar que o indicador segue o filtro.
for (const [nome, cor] of [["Louvor", "purple"], ["Infantil", "blue"]]) {
  const res = await call("POST", "/api/ministries", { cookie: A, body: { name: nome, color: cor } });
  ok(res.s === 201, `ministério ${nome} criado`, res.s);
}

console.log("\n== membros: o conjunto de partida ==");
// 6 membros. Todos nascem com admission_date = hoje e is_new = true.
const membros = [
  ["Ana Louvor",    "Louvor",   "Ativo",   "2020-01-10"],
  ["Bia Louvor",    "Louvor",   "Ativo",   null],
  ["Caio Louvor",   "Louvor",   "Inativo", null],
  ["Davi Infantil", "Infantil", "Ativo",   "2019-05-02"],
  ["Eva Infantil",  "Infantil", "Ativo",   null],
  ["Foca Sem Min",  "Nenhum",   "Ativo",   null],
];
for (const [nome, min, status, batismo] of membros) {
  const res = await call("POST", "/api/members", { cookie: A, body: { name: nome, email: `${nome.split(" ")[0].toLowerCase()}${u}@x.test`, ministry: min, status, baptismDate: batismo } });
  ok(res.s === 201, `criado ${nome}`, res.s);
}

const sum = async (q = "") => (await call("GET", `/api/members?pageSize=1${q}`, { cookie: A })).d;
let m = await sum();
ok(m.total === 6, "total = 6", m.total);
ok(m.summary.newThisMonth === 6, "novos este mês = 6 (todos admitidos hoje)", m.summary?.newThisMonth);
ok(m.summary.active === 5, "ativos = 5", m.summary?.active);
ok(m.summary.baptized === 2, "batizados = 2", m.summary?.baptized);
ok(m.summary.awaitingBaptism === 4, "aguardando batismo = 4", m.summary?.awaitingBaptism);
ok(m.summary.baptized + m.summary.awaitingBaptism === m.total, "batizados + aguardando = total (particionam)", "");

console.log("\n== o indicador não é a marca `is_new` ==");
// Recua a admissão de 4 pessoas para meses anteriores. NINGUÉM mexe em is_new:
// a API grava true na criação e não existe código que limpe. É exatamente o
// estado de um membro cadastrado pelo app há alguns meses.
await sql.query(`UPDATE members SET admission_date = (CURRENT_DATE - interval '2 months')::date
                  WHERE organization_id = $1 AND person_id IN (
                    SELECT id FROM people WHERE organization_id = $1 ORDER BY full_name LIMIT 4)`, [orgId]);
const marca = await sql.query(`SELECT count(*) FILTER (WHERE is_new)::int AS is_new,
                                      count(*) FILTER (WHERE admission_date >= date_trunc('month', CURRENT_DATE)::date)::int AS mes
                                 FROM members WHERE organization_id = $1`, [orgId]);
ok(marca.rows[0].is_new === 0, "a marca is_new nao e mais gravada (fica no DEFAULT)", marca.rows[0].is_new);
await sql.query(`UPDATE members SET is_new = true WHERE organization_id = $1`, [orgId]);
ok(marca.rows[0].mes === 2, "mas só 2 foram admitidos neste mês", marca.rows[0].mes);
m = await sum();
ok(m.summary.newThisMonth === 2, "e mesmo com os 6 marcados à mão o indicador diz 2: é a admissão", m.summary?.newThisMonth);
ok(m.total === 6, "o total não mudou", m.total);

console.log("\n== admissão no futuro não vira 'este mês' ==");
await sql.query(`UPDATE members SET admission_date = (CURRENT_DATE + interval '2 months')::date
                  WHERE organization_id = $1 AND person_id = (
                    SELECT id FROM people WHERE organization_id = $1 ORDER BY full_name DESC LIMIT 1)`, [orgId]);
m = await sum();
ok(m.summary.newThisMonth === 1, "data digitada no futuro fica de fora (a janela tem os dois lados)", m.summary?.newThisMonth);
await sql.query(`UPDATE members SET admission_date = CURRENT_DATE
                  WHERE organization_id = $1 AND person_id = (
                    SELECT id FROM people WHERE organization_id = $1 ORDER BY full_name DESC LIMIT 1)`, [orgId]);

console.log("\n== o indicador SEGUE o filtro ==");
m = await sum("&ministry=Louvor");
ok(m.total === 3, "filtrando Louvor, total = 3", m.total);
ok(m.summary.active === 2, "ativos DO LOUVOR = 2, não os 5 da igreja", m.summary?.active);
ok(m.summary.baptized === 1, "batizados do Louvor = 1", m.summary?.baptized);
ok(m.total > 0 && m.summary.baptized + m.summary.awaitingBaptism === m.total,
   "e continuam particionando o conjunto filtrado (não vazio)", m.total);
m = await sum("&search=Infantil");
ok(m.total === 2, "busca textual também filtra o indicador", m.total);
ok(m.summary.baptized === 1, "batizados entre os buscados = 1", m.summary?.baptized);
m = await sum("&status=Inativo");
ok(m.total === 1 && m.summary.active === 0, "filtrando Inativo, ativos = 0 (coerente com a lista)", `${m.total}/${m.summary?.active}`);

console.log("\n== o indicador NÃO segue a página ==");
const p1 = (await call("GET", "/api/members?pageSize=1&page=1", { cookie: A })).d;
const p2 = (await call("GET", "/api/members?pageSize=1&page=5", { cookie: A })).d;
const pT = (await call("GET", "/api/members?pageSize=100", { cookie: A })).d;
ok(p1.records.length === 1 && pT.records.length === 6, "as páginas têm tamanhos diferentes", `${p1.records.length}/${pT.records.length}`);
ok(JSON.stringify(p1.summary) === JSON.stringify(pT.summary), "e o indicador é IDÊNTICO nas duas: descreve o filtro, não a página", "");
ok(JSON.stringify(p2.summary) === JSON.stringify(pT.summary), "inclusive numa página do fim da lista", "");

console.log("\n== visitantes: as três etapas particionam ==");
const visitantes = [
  ["Val Um",    "Visitou a igreja",   "Maria"],
  ["Val Dois",  "Visitou a igreja",   "Maria"],
  ["Con Um",    "Contato realizado",  "João"],
  ["Cas Um",    "Visita em casa",     "João"],
  ["Bat Um",    "Batismo",            "Maria"],
  ["Mem Um",    "Membro",             "João"],
  ["Mem Dois",  "Membro",             "Maria"],
];
for (const [nome, etapa, quem] of visitantes) {
  const res = await call("POST", "/api/visitors", { cookie: A, body: { name: nome, email: `${nome.replace(/ /g, "").toLowerCase()}${u}@x.test`, membershipStage: etapa, invitedBy: quem } });
  ok(res.s === 201, `criado ${nome} (${etapa})`, res.s);
}
const sumV = async (q = "") => (await call("GET", `/api/visitors?pageSize=1${q}`, { cookie: A })).d;
let v = await sumV();
ok(v.total === 7, "total = 7", v.total);
ok(v.summary.firstVisit === 2, "primeira visita = 2", v.summary?.firstVisit);
ok(v.summary.integrating === 3, "em integração = 3 (contato, visita em casa, batismo)", v.summary?.integrating);
ok(v.summary.markedAsMember === 2, "marcados como membro = 2", v.summary?.markedAsMember);
ok(v.summary.firstVisit + v.summary.integrating + v.summary.markedAsMember === v.total,
   "os três somam o total: nenhuma etapa fica fora de nenhum indicador", "");

console.log("\n== converter APAGA o visitante: 'marcado como membro' não é 'virou membro' ==");
const alvo = (await call("GET", "/api/visitors?pageSize=100&search=Bat Um", { cookie: A })).d.records[0];
const antesMembros = (await sum()).total;
r = await call("POST", `/api/visitors/${alvo.id}/convert`, { cookie: A });
ok(r.s === 200, "conversão aceita", r.s);
v = await sumV();
ok(v.total === 6, "o visitante SAIU da lista de visitantes", v.total);
ok(v.summary.integrating === 2, "e saiu de 'em integração', que era onde ele estava", v.summary?.integrating);
ok(v.summary.markedAsMember === 2, "'marcados como membro' NÃO subiu: quem converte deixa de ser visitante", v.summary?.markedAsMember);
ok((await sum()).total === antesMembros + 1, "quem subiu foi a contagem de MEMBROS", "");
ok(v.summary.firstVisit + v.summary.integrating + v.summary.markedAsMember === v.total, "a soma continua fechando", "");

console.log("\n== visitantes: o indicador segue o filtro e a aba ==");
v = await sumV("&invitedBy=Maria");
ok(v.total === 3, "convidados por Maria = 3", v.total);
ok(v.summary.firstVisit === 2 && v.summary.markedAsMember === 1, "e o indicador é o DESSE recorte", `${v.summary?.firstVisit}/${v.summary?.markedAsMember}`);
v = await sumV("&tab=Pendentes");
ok(v.total === 2, "aba Pendentes = só primeira visita, 2", v.total);
ok(v.summary.firstVisit === 2, "primeira visita = 2", v.summary?.firstVisit);
ok(v.summary.integrating === 0 && v.summary.markedAsMember === 0,
   "e os outros dois zeram POR CONSTRUÇÃO: a aba já os excluiu da lista", `${v.summary?.integrating}/${v.summary?.markedAsMember}`);
v = await sumV("&search=nao-existe-ninguem");
ok(v.total === 0 && v.summary.firstVisit === 0 && v.summary.integrating === 0 && v.summary.markedAsMember === 0,
   "busca sem resultado zera tudo, sem quebrar", JSON.stringify(v.summary));

console.log("\n== isolamento: o indicador é da organização da sessão ==");
r = await call("POST", "/api/auth/register", { body: { organizationName: `Outra ${u}`, fullName: "Outro", email: `o${u}@x.test`, password: "senha1234" } });
const B = r.c;
const mb = (await call("GET", "/api/members?pageSize=1", { cookie: B })).d;
const vb = (await call("GET", "/api/visitors?pageSize=1", { cookie: B })).d;
ok(mb.total === 0 && mb.summary.newThisMonth === 0 && mb.summary.active === 0, "igreja nova: membros zerados", JSON.stringify(mb.summary));
ok(vb.total === 0 && vb.summary.firstVisit === 0 && vb.summary.integrating === 0 && vb.summary.markedAsMember === 0, "igreja nova: visitantes zerados", JSON.stringify(vb.summary));
r = await call("GET", "/api/members?pageSize=1", {});
ok(r.s === 401, "sem sessão não há indicador nenhum -> 401", r.s);

console.log("\n== somente leitura continua vendo os indicadores ==");
await sql.query(`UPDATE subscriptions SET status = 'past_due', current_period_end = (CURRENT_DATE - interval '30 days')
                  WHERE organization_id = $1`, [orgId]);
const ro = (await call("GET", "/api/members?pageSize=1", { cookie: A })).d;
ok(ro && ro.summary && ro.summary.active >= 1, "consultar continua valendo em somente leitura", JSON.stringify(ro?.summary));
r = await call("POST", "/api/members", { cookie: A, body: { name: "Nao Entra", email: `n${u}@x.test` } });
ok(r.s === 402 && r.d?.code === "subscription_read_only", "e criar continua barrado -> 402 subscription_read_only", `${r.s} ${r.d?.code}`);

await sql.end();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
