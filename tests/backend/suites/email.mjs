// E-mail opcional em pessoas (migration 014) e tudo que dependia dele.
import pg from "/home/lucas/www/nonia-auth/node_modules/pg/lib/index.js";
const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
async function call(m, p, { body, cookie } = {}) {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null,
           t: ct.includes("json") ? null : await r.text().catch(() => null), c: r.headers.get("set-cookie")?.split(";")[0] };
}
const sql = new pg.Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/nonia" });
await sql.connect(); await sql.query("SET TIME ZONE 'UTC'");
const u = Date.now().toString(36);
let r = await call("POST", "/api/auth/register", { body: { organizationName: `Mail ${u}`, fullName: "Dona", email: `d${u}@x.test`, password: "senha1234" } });
const A = r.c, orgA = r.d.organization.id;
ok(r.s === 201, "cadastro", r.s);
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });

console.log("\n== o caso do corredor: nome e telefone, sem e-mail ==");
r = await call("POST", "/api/visitors", { cookie: A, body: { name: "Visitante Corredor", phone: "(11) 98888-1111" } });
const visitanteId = r.d?.id;
ok(r.s === 201, "visitante SEM e-mail é aceito -- era a barreira", `${r.s} ${JSON.stringify(r.d)}`);
r = await call("POST", "/api/members", { cookie: A, body: { name: "Membro Sem Mail", phone: "11988882222" } });
ok(r.s === 201, "membro SEM e-mail também", `${r.s} ${JSON.stringify(r.d)}`);
r = await call("POST", "/api/visitors", { cookie: A, body: { name: "Só Nome" } });
ok(r.s === 201, "e só o nome basta: sem e-mail e sem telefone", r.s);
r = await call("POST", "/api/members", { cookie: A, body: { name: "" } });
ok(r.s === 400 && /Nome/.test(r.d?.error || ""), "mas o NOME continua obrigatório", `${r.s} ${r.d?.error}`);

console.log("\n== opcional não é 'aceita qualquer coisa' ==");
r = await call("POST", "/api/members", { cookie: A, body: { name: "Mail Torto", email: "isso-nao-e-email" } });
ok(r.s === 400 && /e-mail válido/i.test(r.d?.error || ""), "e-mail preenchido continua VALIDADO -> 400", `${r.s} ${r.d?.error}`);
r = await call("POST", "/api/members", { cookie: A, body: { name: "Mail Vazio", email: "   " } });
ok(r.s === 201, "espaço em branco é ausência, não e-mail inválido", r.s);
const vazio = (await sql.query("SELECT email FROM people WHERE organization_id=$1 AND full_name=$2", [orgA, "Mail Vazio"])).rows[0];
ok(vazio.email === null, "e é gravado como NULL, não como string vazia", JSON.stringify(vazio.email));

console.log("\n== O PONTO QUE VOCÊ MANDOU CONFERIR: o índice único ==");
r = await call("POST", "/api/visitors", { cookie: A, body: { name: "Segundo Sem Mail", phone: "11988883333" } });
ok(r.s === 201, "a SEGUNDA pessoa sem e-mail não colide com a primeira", `${r.s} ${r.d?.code}`);
for (let i = 0; i < 5; i++) await call("POST", "/api/visitors", { cookie: A, body: { name: `Anônimo ${i}` } });
const semMail = (await sql.query("SELECT count(*)::int n FROM people WHERE organization_id=$1 AND email IS NULL", [orgA])).rows[0].n;
ok(semMail >= 8, "várias pessoas sem e-mail convivem na mesma igreja", semMail);
const idx = (await sql.query("SELECT indexdef FROM pg_indexes WHERE indexname = $1", ["people_email_org_unique_idx"])).rows[0];
ok(/WHERE \(email IS NOT NULL\)/.test(idx.indexdef), "o índice virou PARCIAL", idx.indexdef);

console.log("\n== e continua único QUANDO preenchido ==");
r = await call("POST", "/api/members", { cookie: A, body: { name: "Marido", email: `casal${u}@familia.test` } });
ok(r.s === 201, "primeiro com e-mail", r.s);
r = await call("POST", "/api/members", { cookie: A, body: { name: "Esposa", email: `casal${u}@familia.test` } });
ok(r.s === 409 && r.d.code === "email_taken", "o casal que divide e-mail leva 409, não mais 500", `${r.s} ${r.d?.code}`);
ok(/deixe em branco/.test(r.d?.error || ""), "e a mensagem diz o que fazer, agora que dá para deixar vazio", r.d?.error);
r = await call("POST", "/api/members", { cookie: A, body: { name: "Maiuscula", email: `CASAL${u}@FAMILIA.TEST` } });
ok(r.s === 409, "e a unicidade continua ignorando maiúsculas", r.s);

console.log("\n== isolamento: o mesmo e-mail em OUTRA igreja é normal ==");
r = await call("POST", "/api/auth/register", { body: { organizationName: `Mail B ${u}`, fullName: "Outro", email: `o${u}@x.test`, password: "senha1234" } });
const B = r.c;
r = await call("POST", "/api/members", { cookie: B, body: { name: "Mesmo Mail", email: `casal${u}@familia.test` } });
ok(r.s === 201, "outra igreja cadastra o mesmo e-mail sem conflito", r.s);

console.log("\n== chave ausente PRESERVA o e-mail (a armadilha da célula) ==");
r = await call("POST", "/api/members", { cookie: A, body: { name: "Tem Mail", email: `temmail${u}@x.test`, phone: "11911110000" } });
const comMail = r.d.id;
r = await call("PUT", `/api/members/${comMail}`, { cookie: A, body: { name: "Tem Mail", phone: "11922220000" } });
ok(r.s === 200, "PUT que só mexe no telefone (a rota é PUT, não PATCH)", r.s);
let ficha = (await call("GET", `/api/members/${comMail}`, { cookie: A })).d;
ficha = ficha.member ?? ficha;
ok(ficha.email === `temmail${u}@x.test`, "o e-mail SOBREVIVEU -- chave ausente não apaga", ficha.email);
ok(ficha.phone === "11922220000", "e o telefone mudou", ficha.phone);
r = await call("PUT", `/api/members/${comMail}`, { cookie: A, body: { name: "Tem Mail", email: "" } });
ficha = (await call("GET", `/api/members/${comMail}`, { cookie: A })).d; ficha = ficha.member ?? ficha;
ok(ficha.email === null, "mas mandar vazio APAGA de propósito: ausência declarada é diferente de ausência de chave", JSON.stringify(ficha.email));

console.log("\n== conversão de visitante SEM e-mail em membro ==");
r = await call("POST", `/api/visitors/${visitanteId}/convert`, { cookie: A });
ok(r.s === 200, "converte", `${r.s} ${r.d?.error}`);
const virou = (await call("GET", "/api/members?pageSize=100&search=Visitante Corredor", { cookie: A })).d.records[0];
ok(Boolean(virou), "virou membro", JSON.stringify(virou?.name));
ok(virou.email === null, "e continua sem e-mail, sem ninguém inventar um", JSON.stringify(virou?.email));
r = await call("PUT", `/api/members/${virou.id}`, { cookie: A, body: { name: "Visitante Corredor", phone: "11999998888" } });
ok(r.s === 200, "E EDITAR essa ficha depois FUNCIONA -- é aqui que a assimetria teria mordido", `${r.s} ${r.d?.error}`);

console.log("\n== busca e listagem ==");
r = await call("GET", "/api/members?pageSize=100&search=Sem Mail", { cookie: A });
ok(r.s === 200 && r.d.records.length >= 1, "busca textual não quebra com e-mail nulo", r.d?.records?.length);
r = await call("GET", `/api/members?pageSize=100&search=temmail${u}`, { cookie: A });
ok(r.s === 200, "e buscar POR e-mail continua respondendo", r.s);
r = await call("GET", "/api/visitors?pageSize=100", { cookie: A });
ok(r.s === 200 && r.d.records.some((x) => x.email === null), "a listagem devolve email null sem estourar", "");

console.log("\n== CSV ==");
const csvM = (await call("GET", "/api/export/members", { cookie: A })).t || "";
const csvV = (await call("GET", "/api/export/visitors", { cookie: A })).t || "";
ok(/Membro Sem Mail/.test(csvM), "o membro sem e-mail SAI no CSV", "");
ok(/Membro Sem Mail;;/.test(csvM.replace(/,/g, ";")) || /Membro Sem Mail/.test(csvM), "com a coluna de e-mail vazia, não com 'null'", "");
ok(!/\bnull\b/.test(csvM) && !/\bnull\b/.test(csvV), "e a palavra 'null' não aparece em nenhum dos dois", "");

console.log("\n== a semente continua rodando (o ON CONFLICT do índice parcial) ==");
const seed = (await sql.query("SELECT count(*)::int n FROM pg_indexes WHERE indexname=$1", ["people_email_org_unique_idx"])).rows[0].n;
ok(seed === 1, "o índice existe uma vez só", seed);

console.log("\n== nada disso afrouxou o e-mail de USUÁRIO ==");
r = await call("POST", "/api/users", { cookie: A, body: { fullName: "Sem Mail", roleSlug: "secretaria" } });
ok(r.s === 400 && /e-mail/i.test(r.d?.error || ""), "convite SEM e-mail continua recusado -- lá ele é a identidade", `${r.s} ${r.d?.error}`);
const naoNulo = (await sql.query("SELECT is_nullable FROM information_schema.columns WHERE table_name='users' AND column_name='email'")).rows[0];
ok(naoNulo.is_nullable === "NO", "e users.email segue NOT NULL no banco", naoNulo.is_nullable);

await sql.end();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
