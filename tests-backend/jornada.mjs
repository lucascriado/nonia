import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("/home/lucas/www/nonia-auth/node_modules/pg");
const BASE = "http://127.0.0.1:3210";
const db = new Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/jornada" });
await db.connect();

const achados = [];
const anota = (grav, txt) => { achados.push({ grav, txt }); console.log(`      >> ${grav}: ${txt}`); };

async function call(method, path, { body, cookie } = {}) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json().catch(() => null) : await res.text();
  return { status: res.status, data, cookie: res.headers.get("set-cookie")?.split(";")[0], headers: res.headers };
}
const passo = (n, t) => console.log(`\n${"─".repeat(70)}\n${n}. ${t}\n${"─".repeat(70)}`);

// ─── 1. a igreja cadastra e entra ───────────────────────────────────────────
passo(1, "A igreja chega pelo site, cadastra e entra");
let r = await call("POST", "/api/auth/register", { body: {
  organizationName: "Igreja Batista Central", fullName: "Pastor Anderson",
  email: "pastor@ibcentral.test", password: "senha1234" } });
console.log(`   cadastro: ${r.status} | organização "${r.data?.organization?.name}" | papel ${r.data?.role?.slug}`);
const PASTOR = r.cookie;
const ORG = r.data.organization.id;
r = await call("GET", "/api/auth/session", { cookie: PASTOR });
console.log(`   plano: ${r.data.plan.slug} (${r.data.plan.source}) | faltam ${r.data.plan.trialDaysLeft} dias | teto ${r.data.plan.maxMembers} membros / ${r.data.plan.maxUsers} usuários`);
anota("INCOMODA", "o objeto plan da sessão não é lido por nenhuma tela: o tipo SessionPayload do frontend nem tem o campo. A igreja nunca vê que está em avaliação nem quantos dias faltam.");
r = await call("GET", "/api/dashboard", { cookie: PASTOR });
console.log(`   painel numa igreja vazia: ${JSON.stringify(r.data.stats)}`);

// ─── 2. convida secretaria e líder ──────────────────────────────────────────
passo(2, "O pastor convida a secretaria e um líder de célula");
r = await call("GET", "/api/roles", { cookie: PASTOR });
console.log(`   papéis disponíveis: ${r.data.map((p) => p.slug).join(", ")}`);
anota("BLOQUEIA", "não existe NENHUMA tela de usuários. /api/users, /api/users/[id] e /api/roles não são chamados por nada em app/ nem components/. O passo 2 da jornada é impossível pela interface: convidar alguém exige POST manual na API.");

r = await call("POST", "/api/users", { cookie: PASTOR, body: { email: "secretaria@ibcentral.test", fullName: "Marta Oliveira", roleSlug: "secretaria" } });
const tokenSec = r.data?.inviteUrl?.split("/convite/")[1];
console.log(`   convite secretaria: ${r.status} | url ${r.data?.inviteUrl?.slice(0, 60)}...`);
anota("BLOQUEIA", "o convite não é enviado por e-mail (não há SMTP). A inviteUrl volta no corpo da resposta do POST — sem tela, ninguém nunca vê essa URL, então o convite não chega ao convidado de forma alguma.");

r = await call("POST", "/api/users", { cookie: PASTOR, body: { email: "lider@ibcentral.test", fullName: "Ricardo Mendes", roleSlug: "lider" } });
const tokenLider = r.data?.inviteUrl?.split("/convite/")[1];
console.log(`   convite líder: ${r.status}`);

r = await call("GET", `/api/auth/invite?token=${tokenSec}`);
console.log(`   a tela /convite/[token] lê: ${JSON.stringify(r.data)}`);
r = await call("POST", "/api/auth/invite/accept", { body: { token: tokenSec, fullName: "Marta Oliveira", password: "senha1234" } });
const SEC = r.cookie;
console.log(`   secretaria aceitou: ${r.status} | papel ${r.data?.role?.slug}`);
r = await call("POST", "/api/auth/invite/accept", { body: { token: tokenLider, fullName: "Ricardo Mendes", password: "senha1234" } });
const LIDER = r.cookie;
console.log(`   líder aceitou: ${r.status} | papel ${r.data?.role?.slug}`);

// ─── 3. a secretaria trabalha ───────────────────────────────────────────────
passo(3, "A secretaria cadastra o dia a dia da igreja");
r = await call("POST", "/api/ministries", { cookie: SEC, body: { name: "Louvor", color: "blue" } });
console.log(`   ministério: ${r.status}`);
r = await call("POST", "/api/cells", { cookie: SEC, body: { name: "Célula Esperança", meetingDay: "Quarta", meetingTime: "19:30" } });
console.log(`   célula: ${r.status}`);
for (const [nome, email] of [["Ana Clara Oliveira", "ana@x.test"], ["Marcos Santos", "marcos@x.test"], ["Júlia Pereira", "julia@x.test"]]) {
  await call("POST", "/api/members", { cookie: SEC, body: { name: nome, email, ministry: "Louvor", cell: "Célula Esperança" } });
}
r = await call("GET", "/api/members", { cookie: SEC });
console.log(`   membros: ${r.data.length}`);
r = await call("POST", "/api/visitors", { cookie: SEC, body: { name: "Beatriz Lima", email: "bia@x.test", invitedBy: "Ana Clara", membershipStage: "Contato realizado" } });
const visitante = r.data?.id;
console.log(`   visitante: ${r.status}`);
r = await call("POST", `/api/visitors/${visitante}/convert`, { cookie: SEC });
console.log(`   converteu visitante em membro: ${r.status}`);
r = await call("POST", "/api/events", { cookie: SEC, body: { title: "Culto de Celebração", location: "Templo", startsAt: "2026-10-04T19:00:00Z" } });
console.log(`   evento: ${r.status}`);
r = await call("POST", "/api/financeiro", { cookie: SEC, body: { type: "income", description: "Dízimos de setembro", category: "Dízimos", amount: "18500.00", status: "paid", transactionDate: "2026-09-06" } });
console.log(`   lançamento financeiro pela secretaria: ${r.status} ${r.status !== 201 ? JSON.stringify(r.data) : ""}`);
if (r.status === 403) anota("BLOQUEIA", `a secretaria NÃO consegue lançar no financeiro (só finance.read). Numa igreja é a secretaria que lança dízimo e oferta. Mensagem recebida: "${r.data?.error}"`);

r = await call("GET", "/api/activities", { cookie: SEC });
console.log(`   histórico de atividades: ${r.data?.total} registros`);

// ─── 4. o líder tenta o que não pode ────────────────────────────────────────
passo(4, "O líder de célula tenta o que NÃO pode");
for (const [rot, m, p, b] of [
  ["lançar no financeiro", "POST", "/api/financeiro", { type: "income", description: "X", category: "Dízimos", amount: "1.00", transactionDate: "2026-09-06" }],
  ["ver o financeiro", "GET", "/api/financeiro", null],
  ["cadastrar membro", "POST", "/api/members", { name: "X", email: "x@x.test" }],
  ["convidar usuário", "POST", "/api/users", { email: "z@x.test", fullName: "Z", roleSlug: "admin" }],
  ["contratar plano", "POST", "/api/billing/subscribe", { planSlug: "comunidade" }],
]) {
  const res = await call(m, p, { cookie: LIDER, body: b });
  console.log(`   ${rot.padEnd(22)} -> ${res.status} ${res.data?.code ?? ""}`);
  if (res.status === 403) console.log(`      "${res.data?.error}"`);
}
anota("INCOMODA", 'a mensagem de permissão é sempre a mesma: "Seu papel (Líder) não permite esta ação." Ela diz o que NÃO dá, mas não diz a quem pedir. Numa igreja, "peça ao responsável pela conta" resolveria o chamado.');

await db.end();
console.log("\n\n=== ACHADOS ATÉ AQUI ===");
for (const a of achados) console.log(`  [${a.grav}] ${a.txt}`);
