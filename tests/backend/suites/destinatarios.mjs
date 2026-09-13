// "Quero escolher esses números": a prévia com nomes, a lista explícita e a
// deduplicação por número. Os três na mesma suíte porque são um recurso só --
// ver sem poder escolher é a metade que não serve.
import pg from "/home/lucas/www/nonia-auth/node_modules/pg/lib/index.js";
import { iniciarOpenWaFalso, conectarSessao, enviadas } from "../apoio/openwa-falso.mjs";
const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
async function call(m, p, { body, cookie } = {}) {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null, c: r.headers.get("set-cookie")?.split(";")[0] };
}
const servidor = await iniciarOpenWaFalso(2786);
const sql = new pg.Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/nonia" });
await sql.connect();
const u = Date.now().toString(36);

let r = await call("POST", "/api/auth/register", { body: { organizationName: `Dest ${u}`, fullName: "Dona", email: `t${u}@x.test`, password: "senha1234" } });
const A = r.c;
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });
await call("POST", "/api/whatsapp/connect", { cookie: A });
conectarSessao();

// O cadastro: quatro casos de verdade numa igreja.
for (const [nome, fone] of [
  ["Ana Silva", "(11) 98888-0001"],
  ["Bruno Costa", "(11) 98888-0002"],
  ["Carla Dias", null],                    // sem telefone
  ["Casal Ela", "(11) 97777-1234"],        // marido e mulher,
  ["Casal Ele", "(11) 97777-1234"],        // mesmo aparelho
  ["Zeca Torto", "123"],                   // telefone que não vira WhatsApp
]) {
  await call("POST", "/api/members", { cookie: A, body: { name: nome, ...(fone ? { phone: fone } : {}) } });
}

console.log("\n== a lista deixa de ser um número ==");
r = await call("GET", "/api/whatsapp/broadcasts/destinatarios?audience=members", { cookie: A });
ok(r.s === 200, "a rota responde", `${r.s} ${r.d?.code}`);
ok(r.d.total === 6, "as SEIS pessoas do filtro aparecem, inclusive quem não recebe", r.d?.total);
const por = Object.fromEntries(r.d.records.map((x) => [x.name, x]));
ok(por["Ana Silva"].recebe === true && por["Ana Silva"].motivo === null, "quem recebe vem com recebe=true e sem motivo", JSON.stringify(por["Ana Silva"]));
ok(por["Ana Silva"].phone === "(11) 98888-0001", "com o telefone como está no cadastro, para dar para conferir", por["Ana Silva"]?.phone);
ok(Boolean(por["Ana Silva"].personId), "e com o personId, que é o que a seleção vai devolver", por["Ana Silva"]?.personId);

console.log("\n== quem não recebe NÃO some: aparece com o motivo ==");
ok(por["Carla Dias"].recebe === false && por["Carla Dias"].motivo === "sem_telefone",
   "sem telefone no cadastro -> sem_telefone", JSON.stringify(por["Carla Dias"]));
ok(por["Zeca Torto"].recebe === false && por["Zeca Torto"].motivo === "telefone_invalido",
   "telefone que não vira número de WhatsApp -> telefone_invalido, e é diferente de não ter", JSON.stringify(por["Zeca Torto"]));

console.log("\n== DUAS PESSOAS, UM APARELHO, UMA MENSAGEM ==");
ok(por["Casal Ela"].recebe === true && por["Casal Ele"].recebe === false,
   "só o primeiro em ordem alfabética recebe", JSON.stringify([por["Casal Ela"]?.recebe, por["Casal Ele"]?.recebe]));
ok(por["Casal Ele"].motivo === "numero_repetido",
   "e o segundo continua na lista, dizendo por quê -- nome não some sem explicação", por["Casal Ele"]?.motivo);
ok(r.d.resumo.total === 6 && r.d.resumo.comTelefone === 3,
   "o resumo conta QUEM RECEBE (3), não quem tem número (4)", JSON.stringify([r.d.resumo?.total, r.d.resumo?.comTelefone]));
ok(r.d.resumo.estimativaSegundos === 12,
   "e a duração estimada sai do mesmo 3 -- contar 4 prometeria uma entrega que não acontece", r.d.resumo?.estimativaSegundos);

console.log("\n== a prévia de números e a prévia de nomes são a MESMA resolução ==");
const numeros = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", filters: {}, preview: true } });
ok(JSON.stringify(numeros.d.preview) === JSON.stringify(r.d.resumo),
   "o `resumo` é byte a byte o objeto que `preview: true` já devolvia", JSON.stringify(numeros.d?.preview));

console.log("\n== e o ENVIO enxerga o mesmo público ==");
let antes = enviadas.length;
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", filters: {}, message: "Culto domingo 19h" } });
ok(r.s === 201 && r.d.comTelefone === 3, "o envio é criado, e conta 3 -- o mesmo da prévia", `${r.s} ${r.d?.comTelefone}`);
let dest = (await sql.query("SELECT name, status FROM whatsapp_broadcast_recipients WHERE broadcast_id=$1 ORDER BY name", [r.d.id])).rows;
ok(dest.length === 6, "uma linha por pessoa, inclusive as puladas", dest.length);
ok(dest.find((d) => d.name === "Casal Ele").status === "skipped",
   "o repetido entra como skipped -- mandar seria a segunda mensagem ao mesmo aparelho", dest.find((d) => d.name === "Casal Ele")?.status);
ok(dest.filter((d) => d.status === "pending").length === 3, "e só três ficam para enviar", dest.filter((d) => d.status === "pending").length);

console.log("\n== ESCOLHER: a lista explícita é o alvo ==");
r = await call("GET", "/api/whatsapp/broadcasts/destinatarios?audience=members", { cookie: A });
const escolhidos = r.d.records.filter((x) => x.recebe && x.name !== "Bruno Costa").map((x) => x.personId);
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", filters: {}, message: "Só para alguns", incluir: escolhidos } });
ok(r.s === 201, "envio com lista explícita é aceito", `${r.s} ${r.d?.code}`);
dest = (await sql.query("SELECT name, status FROM whatsapp_broadcast_recipients WHERE broadcast_id=$1 ORDER BY name", [r.d.id])).rows;
ok(dest.length === 2, "só as pessoas escolhidas viram destinatário", dest.map((d) => d.name).join(","));
ok(!dest.some((d) => d.name === "Bruno Costa"), "quem foi desmarcado não recebe", dest.map((d) => d.name).join(","));

console.log("\n== E É POR ISSO QUE `incluir` EXISTE: a janela entre ver e enviar ==");
r = await call("GET", "/api/whatsapp/broadcasts/destinatarios?audience=members", { cookie: A });
const vistos = r.d.records.filter((x) => x.recebe).map((x) => x.personId);
const quantosVi = vistos.length;
// Entre conferir a lista e apertar enviar, entra um cadastro que casa com o
// mesmo filtro. Sem `incluir`, o envio resolveria de novo e alcançaria mais uma
// pessoa que ninguém viu.
await call("POST", "/api/members", { cookie: A, body: { name: "Aaa Recem Chegada", phone: "(11) 96666-9999" } });
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", filters: {}, message: "x", incluir: vistos } });
dest = (await sql.query("SELECT count(*)::int n FROM whatsapp_broadcast_recipients WHERE broadcast_id=$1", [r.d.id])).rows[0].n;
ok(dest === quantosVi, `com incluir: vi ${quantosVi}, mandou para ${dest} -- a janela não existe`, dest);
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", filters: {}, message: "x" } });
// Comparado com quem RECEBE dos dois lados, e não linhas contra pessoas: o
// número tem que ser justo, senão o teste exagera o defeito que ele denuncia.
const semIncluir = (await sql.query(
  "SELECT count(*)::int n FROM whatsapp_broadcast_recipients WHERE broadcast_id=$1 AND status='pending'", [r.d.id])).rows[0].n;
ok(semIncluir === quantosVi + 1,
   `e sem incluir o alvo é recalculado: ${semIncluir} recebem contra os ${quantosVi} vistos -- é o defeito, demonstrado`, semIncluir);

console.log("\n== a lista explícita não fura teto, tenant nem permissão ==");
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", filters: {}, message: "x", incluir: [] } });
ok(r.s === 400 && r.d.code === "no_recipients_selected", "lista vazia -> 400, não um envio para ninguém", `${r.s} ${r.d?.code}`);
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: A, body: { audience: "members", filters: {}, message: "x", incluir: "nao-e-lista" } });
ok(r.s === 400 && r.d.code === "invalid_selection", "formato errado -> 400 com motivo, não 500", `${r.s} ${r.d?.code}`);

r = await call("POST", "/api/auth/register", { body: { organizationName: `Dest B ${u}`, fullName: "Outro", email: `tb${u}@x.test`, password: "senha1234" } });
const B = r.c;
await call("POST", "/api/billing/subscribe", { cookie: B, body: { planSlug: "comunidade" } });
await call("POST", "/api/whatsapp/connect", { cookie: B });
await call("POST", "/api/members", { cookie: B, body: { name: "Dela", phone: "(11) 95555-0000" } });
r = await call("POST", "/api/whatsapp/broadcasts", { cookie: B, body: { audience: "members", filters: {}, message: "x", incluir: vistos } });
ok(r.s === 400 && r.d.code === "no_recipients",
   "id de pessoa da OUTRA igreja não vira destinatário -- some no WHERE do tenant", `${r.s} ${r.d?.code}`);
const vazou = (await sql.query(
  `SELECT count(*)::int n FROM whatsapp_broadcast_recipients r
     JOIN whatsapp_broadcasts b ON b.id = r.broadcast_id
    WHERE b.organization_id <> r.organization_id`)).rows[0].n;
ok(vazou === 0, "e nenhum destinatário ficou com organização trocada", vazou);

console.log("\n== permissões ==");
const sec = await call("POST", "/api/users", { cookie: A, body: { email: `s${u}@x.test`, fullName: "Sec", roleSlug: "secretaria" } });
const tk = sec.d.inviteUrl.split("/convite/")[1];
const cSec = (await call("POST", "/api/auth/invite/accept", { body: { token: tk, fullName: "Sec", password: "senha1234" } })).c;
r = await call("GET", "/api/whatsapp/broadcasts/destinatarios?audience=members", { cookie: cSec });
ok(r.s === 403, "a secretaria não tem whatsapp.broadcast -> 403 até para VER a lista de alvos", r.s);

console.log("\n== filtro: a lista é a do filtro que a pessoa está vendo ==");
r = await call("GET", "/api/whatsapp/broadcasts/destinatarios?audience=members&search=Casal", { cookie: A });
ok(r.d.total === 2 && r.d.records.every((x) => x.name.startsWith("Casal")),
   "o mesmo `search` da listagem filtra a prévia", `${r.d?.total}`);
ok(r.d.records.find((x) => x.name === "Casal Ele").motivo === "numero_repetido",
   "e a deduplicação continua valendo dentro do filtro", "");

await sql.end(); servidor.close();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
