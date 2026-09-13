import { createRequire } from "node:module";
const require2 = createRequire("/home/lucas/www/nonia-auth/package.json");
const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
const FOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const ANEXO = "data:application/pdf;base64,JVBERi0xLjQK";
async function call(m, p, { body, cookie } = {}) {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null, c: r.headers.get("set-cookie")?.split(";")[0] };
}
const u = Date.now().toString(36);
let r = await call("POST", "/api/auth/register", { body: { organizationName: `Peso ${u}`, fullName: "Dono", email: `d${u}@x.test`, password: "senha1234" } });
const A = r.c;
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });

console.log("== a listagem emagreceu, mas não perdeu informação ==");
await call("POST", "/api/members", { cookie: A, body: { name: "Com Foto", email: `cf${u}@x.test`, photoDataUrl: FOTO } });
await call("POST", "/api/members", { cookie: A, body: { name: "Sem Foto", email: `sf${u}@x.test` } });
r = await call("GET", "/api/members", { cookie: A });
const comFoto = r.d.records.find((m) => m.name === "Com Foto");
const semFoto = r.d.records.find((m) => m.name === "Sem Foto");
ok(comFoto.photoDataUrl === undefined, "a listagem NÃO traz a foto");
ok(comFoto.hasPhoto === true && semFoto.hasPhoto === false, "mas diz quem tem, para a tela escolher entre foto e iniciais");
r = await call("GET", `/api/members/${comFoto.id}`, { cookie: A });
ok(r.s === 200 && r.d.photoDataUrl === FOTO, "e o GET por id traz a foto inteira", r.s);

console.log("\n== A REDE: editar sem mandar a foto NÃO pode apagá-la ==");
r = await call("PUT", `/api/members/${comFoto.id}`, { cookie: A, body: { name: "Com Foto", email: `cf${u}@x.test`, phone: "(11) 90000-0000" } });
ok(r.s === 200, "editou só o telefone, sem mandar photoDataUrl", r.s);
r = await call("GET", `/api/members/${comFoto.id}`, { cookie: A });
ok(r.d.photoDataUrl === FOTO, "a foto CONTINUA lá -- campo ausente preserva");
r = await call("PUT", `/api/members/${comFoto.id}`, { cookie: A, body: { name: "Com Foto", email: `cf${u}@x.test`, photoDataUrl: null } });
r = await call("GET", `/api/members/${comFoto.id}`, { cookie: A });
ok(r.d.photoDataUrl === null, "mas mandar null explícito apaga, que é o botão de remover");

console.log("\n== o mesmo no financeiro ==");
r = await call("POST", "/api/financeiro", { cookie: A, body: { type: "income", description: "Dízimo", category: "Dízimos", amount: "100.00", transactionDate: "2026-09-06", attachmentUrl: ANEXO, attachmentName: "comprovante.pdf" } });
const lanc = r.d.id;
r = await call("GET", "/api/financeiro", { cookie: A });
ok(r.d.records[0].attachmentUrl === undefined && r.d.records[0].hasAttachment === true, "listagem sem o anexo, mas diz que existe");
ok(r.d.records[0].attachmentName === "comprovante.pdf", "e traz o nome do arquivo");
r = await call("GET", `/api/financeiro/${lanc}`, { cookie: A });
ok(r.d.attachmentUrl === ANEXO, "GET por id traz o comprovante");
await call("PUT", `/api/financeiro/${lanc}`, { cookie: A, body: { type: "income", description: "Dízimo corrigido", category: "Dízimos", amount: "120.00", transactionDate: "2026-09-06" } });
r = await call("GET", `/api/financeiro/${lanc}`, { cookie: A });
ok(r.d.attachmentUrl === ANEXO && r.d.description === "Dízimo corrigido", "editar sem mandar o anexo preserva o comprovante");

console.log("\n== visitantes ==");
await call("POST", "/api/visitors", { cookie: A, body: { name: "Visita", email: `v${u}@x.test`, photoDataUrl: FOTO } });
r = await call("GET", "/api/visitors", { cookie: A });
ok(r.d.records[0].photoDataUrl === undefined && r.d.records[0].hasPhoto === true, "listagem de visitantes idem");
r = await call("GET", `/api/visitors/${r.d.records[0].id}`, { cookie: A });
ok(r.d.photoDataUrl === FOTO, "e o GET por id traz a foto");

console.log("\n== id malformado é 404, não 500 ==");
for (const [m, p] of [["GET", "/api/members/nao-e-uuid"], ["PUT", "/api/members/123"], ["DELETE", "/api/members/abc"],
                      ["PATCH", "/api/users/nao-e-uuid"], ["DELETE", "/api/users/xyz"], ["GET", "/api/financeiro/000"],
                      ["PUT", "/api/cells/zzz"], ["DELETE", "/api/ministries/1"], ["POST", "/api/visitors/qqq/convert"],
                      ["GET", "/api/ministries/w/attendance"], ["DELETE", "/api/events?id=nope"]]) {
  const res = await call(m, p, { cookie: A, body: m === "PUT" || m === "PATCH" ? { name: "X", email: "x@x.test" } : undefined });
  ok(res.s === 404, `${m} ${p}`, res.s);
}
r = await call("GET", "/api/members/00000000-0000-0000-0000-000000000000", { cookie: A });
ok(r.s === 404, "e uuid válido inexistente continua 404 também", r.s);

console.log("\n== revogar convite pendente ==");
r = await call("POST", "/api/users", { cookie: A, body: { email: `errado${u}@x.test`, fullName: "Digitado Errado", roleSlug: "leitura" } });
const conv = r.d.id;
r = await call("GET", "/api/users", { cookie: A });
ok(r.d.invitations.length === 1, "1 convite pendente na lista", r.d.invitations.length);
r = await call("DELETE", `/api/invitations/${conv}`, { cookie: A });
ok(r.s === 200 && r.d.ok === true, "revogou", `${r.s} ${r.d?.code}`);
r = await call("GET", "/api/users", { cookie: A });
ok(r.d.invitations.length === 0, "sumiu da lista", r.d.invitations.length);
r = await call("DELETE", `/api/invitations/${conv}`, { cookie: A });
ok(r.s === 200, "revogar de novo é sucesso, não erro -- dois cliques não podem falhar", r.s);
r = await call("DELETE", `/api/invitations/00000000-0000-0000-0000-000000000000`, { cookie: A });
ok(r.s === 404, "convite inexistente -> 404", r.s);

console.log("\n== e o assento volta, que é o ponto ==");
r = await call("POST", "/api/users", { cookie: A, body: { email: `outro${u}@x.test`, fullName: "Outro", roleSlug: "leitura" } });
ok(r.s === 201, "dá para convidar de novo depois de revogar", r.s);
r = await call("GET", "/api/auth/session", { cookie: A });
ok(r.d.plan.usage.users === 2, "e o uso conta 2 assentos (dono + 1 convite), não 3", r.d.plan?.usage?.users);

console.log("\n== convite já aceito não se revoga ==");
const t = (await call("POST", "/api/users", { cookie: A, body: { email: `aceito${u}@x.test`, fullName: "Aceito", roleSlug: "leitura" } })).d;
await call("POST", "/api/auth/invite/accept", { body: { token: t.inviteUrl.split("/convite/")[1], fullName: "Aceito", password: "senha1234" } });
r = await call("DELETE", `/api/invitations/${t.id}`, { cookie: A });
ok(r.s === 409 && r.d.code === "invitation_not_pending", "409 invitation_not_pending", `${r.s} ${r.d?.code}`);
ok(/remova o usuário/.test(r.d?.error || ""), "e a mensagem manda para o caminho certo", r.d?.error);

console.log("\n== convite EXPIRADO já não segurava assento ==");
{
  const { Client } = require2("pg");
  const db = new Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/nonia" });
  await db.connect();
  const antes = (await call("GET", "/api/auth/session", { cookie: A })).d.plan.usage.users;
  const novo = await call("POST", "/api/users", { cookie: A, body: { email: `exp${u}@x.test`, fullName: "Vai Expirar", roleSlug: "leitura" } });
  ok((await call("GET", "/api/auth/session", { cookie: A })).d.plan.usage.users === antes + 1, "convite novo OCUPA assento");
  await db.query("UPDATE invitations SET expires_at = now() - interval '1 day' WHERE id = $1", [novo.d.id]);
  const depois = (await call("GET", "/api/auth/session", { cookie: A })).d.plan.usage.users;
  ok(depois === antes, "e ao EXPIRAR ele LIBERA o assento sozinho -- sem ninguém rodar nada", `${depois} vs ${antes}`);
  const lista = (await call("GET", "/api/users", { cookie: A })).d.invitations.map((i) => i.email);
  ok(!lista.includes(`exp${u}@x.test`), "e some da lista de pendentes");
  const st = (await db.query("SELECT status FROM invitations WHERE id = $1", [novo.d.id])).rows[0].status;
  ok(st === "pending", "a linha continua 'pending' no banco: derivado na leitura, como a avaliação", st);
  await db.end();
}

console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
