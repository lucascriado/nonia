import { createRequire } from "node:module";
const require2 = createRequire("/home/lucas/www/nonia-auth/package.json");
const { Client } = require2("pg");
const { execFileSync } = require2("child_process");
const fs = require2("fs");
const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
const call = async (m, p, { body, cookie } = {}) => {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null, c: r.headers.get("set-cookie")?.split(";")[0], h: r.headers };
};
// lê o zip com o zipfile do Python: ferramenta externa, não a minha
const abrir = async (url, cookie) => {
  const r = await fetch(BASE + url, { headers: { cookie } });
  if (!r.ok) return { s: r.status, d: await r.json().catch(() => null), nomes: [] };
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync("/tmp/z.zip", buf);
  const saida = execFileSync("python3", ["-c",
    "import zipfile,json;z=zipfile.ZipFile('/tmp/z.zip');t=z.namelist();c=[n for n in t if n.endswith('.csv')];print(json.dumps({'tudo':t,'nomes':[n.replace('comprovantes/','') for n in t if not n.endswith('.csv')],'csv':c[0] if c else None,'csvBytes':(z.read(c[0]).decode('utf-8') if c else ''),'crc':z.testzip() is None}))"]).toString();
  return { s: r.status, bytes: buf.length, ...JSON.parse(saida) };
};
const PDF = "data:application/pdf;base64," + Buffer.from("%PDF-1.4 conteudo").toString("base64");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const db = new Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/nonia" }); await db.connect();
const u = Date.now().toString(36);

let r = await call("POST", "/api/auth/register", { body: { organizationName: `Comp ${u}`, fullName: "Tesoureiro", email: `t${u}@x.test`, password: "senha1234" } });
const A = r.c; const org = r.d.organization.id;
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });

const lancar = (desc, cat, tipo, data, anexo, extra = {}) =>
  call("POST", "/api/financeiro", { cookie: A, body: {
    type: tipo, description: desc, category: cat, amount: "100.00", status: "paid",
    transactionDate: data, ...(anexo ? { attachmentUrl: anexo, attachmentName: "x" } : {}), ...extra } });

await lancar("Dízimos de setembro", "Dízimos", "income", "2026-09-06", PDF);
await lancar("Aluguel do salão", "Aluguel", "expense", "2026-09-01", PNG);
await lancar("Oferta sem comprovante", "Ofertas", "income", "2026-09-03", null);
await lancar("Conta de água", "Contas e Utilidades", "expense", "2026-08-15", PDF);

console.log("== o zip básico ==");
let z = await abrir("/api/export/comprovantes", A);
ok(z.s === 200, "200", z.s);
ok(z.crc === true, "abre e o CRC de todos confere (validado pelo zipfile do Python)");
ok(z.nomes.length === 3, "3 comprovantes -- o lançamento SEM anexo não entrou", z.nomes.length);
ok(!z.nomes.some((n) => /sem comprovante/i.test(n)), "e não há marcador nem arquivo vazio para ele");

console.log("\n== o nome serve para conferência humana ==");
console.log("     " + z.nomes.join("\n     "));
ok(z.nomes.every((n) => /^\d{4}-\d{2}-\d{2} - (Entrada|Saida) - /.test(n)), "data (ISO) - tipo - descrição");
ok(z.nomes.some((n) => n.includes("Dizimos de setembro.pdf")), "descrição no nome, com a extensão certa");
ok(z.nomes.some((n) => n.endsWith(".png")), "PNG sai como .png, não como .pdf");
ok(z.nomes.every((n) => !/[À-ÿ]/.test(n)), "sem acento no nome do arquivo, para não quebrar em sistema antigo");
const ordenado = [...z.nomes].sort();
ok(JSON.stringify(ordenado) === JSON.stringify(["2026-08-15 - Saida - Conta de agua.pdf","2026-09-01 - Saida - Aluguel do salao.png","2026-09-06 - Entrada - Dizimos de setembro.pdf"]), "e a PASTA ordena cronologicamente ao ordenar por nome", ordenado.join(" | "));

console.log("\n== colisão de nome ==");
await lancar("Oferta do culto", "Ofertas", "income", "2026-09-10", PDF);
await lancar("Oferta do culto", "Ofertas", "income", "2026-09-10", PDF);
await lancar("Oferta do culto", "Ofertas", "income", "2026-09-10", PDF);
z = await abrir("/api/export/comprovantes", A);
const colisoes = z.nomes.filter((n) => n.includes("Oferta do culto"));
ok(colisoes.length === 3, "os 3 homônimos estão no zip", colisoes.length);
ok(new Set(colisoes).size === 3, "com nomes distintos -- nenhum sobrescreve o outro", colisoes.join(" | "));
ok(colisoes.some((n) => n.includes("(2)")) && colisoes.some((n) => n.includes("(3)")), "sufixo numérico", colisoes.join(" | "));

console.log("\n== os MESMOS filtros do CSV e da listagem ==");
z = await abrir("/api/export/comprovantes?type=Entrada", A);
ok(z.nomes.every((n) => n.includes("Entrada")), "type=Entrada só traz entradas", z.nomes.length);
z = await abrir("/api/export/comprovantes?category=Aluguel", A);
ok(z.nomes.length === 1 && z.nomes[0].includes("Aluguel do salao"), "category filtra", z.nomes.join());
z = await abrir("/api/export/comprovantes?search=agua", A);
ok(z.nomes.length === 0 || z.s === 404, "busca sem acento não acha (ILIKE é literal), e vira mensagem", z.s);
z = await abrir("/api/export/comprovantes?search=Conta", A);
ok(z.nomes.length === 1, "busca com o termo certo acha", z.nomes.length);
const csv = await (await fetch(BASE + "/api/export/financeiro?type=Entrada", { headers: { cookie: A } })).text();
const zEnt = await abrir("/api/export/comprovantes?type=Entrada", A);
const comAnexoNoCsv = csv.split("\r\n").filter((l) => l.includes(";Sim;")).length;
ok(zEnt.nomes.length === comAnexoNoCsv, `o zip tem ${zEnt.nomes.length} e o CSV marca ${comAnexoNoCsv} com comprovante -- os dois filtros batem`);

console.log("\n== zero comprovantes vira MENSAGEM, não zip vazio ==");
z = await abrir("/api/export/comprovantes?category=Missões", A);
ok(z.s === 404 && z.d?.code === "no_attachments", "404 no_attachments", `${z.s} ${z.d?.code}`);
ok(/Ajuste o período ou os filtros/.test(z.d?.error || ""), "com instrução do que fazer", z.d?.error);

console.log("\n== exclusão lógica respeitada ==");
const lanc = (await call("GET", "/api/financeiro?category=Aluguel", { cookie: A })).d.records[0];
await call("DELETE", `/api/financeiro/${lanc.id}`, { cookie: A });
z = await abrir("/api/export/comprovantes", A);
ok(!z.nomes.some((n) => n.includes("Aluguel do salao")), "comprovante de lançamento excluído NÃO entra");
z = await abrir("/api/export/comprovantes?deleted=1", A);
ok(z.nomes.length === 1 && z.nomes[0].includes("Aluguel do salao"), "mas entra na lixeira, quando pedida explicitamente", z.nomes.join());
await call("POST", `/api/financeiro/${lanc.id}/restore`, { cookie: A });

console.log("\n== permissão e tenant ==");
await call("POST", "/api/users", { cookie: A, body: { email: `l${u}@x.test`, fullName: "Léo", roleSlug: "leitura", password: "senha1234" } });
const L = (await call("POST", "/api/auth/login", { body: { email: `l${u}@x.test`, password: "senha1234" } })).c;
ok((await abrir("/api/export/comprovantes", L)).s === 403, "'leitura' não baixa comprovante (não tem finance.read)");
const outra = await call("POST", "/api/auth/register", { body: { organizationName: `Outra ${u}`, fullName: "O", email: `o${u}@x.test`, password: "senha1234" } });
await call("POST", "/api/billing/subscribe", { cookie: outra.c, body: { planSlug: "comunidade" } });
ok((await abrir("/api/export/comprovantes", outra.c)).s === 404, "outra igreja não vê comprovante desta -- vem 'nenhum'");
const semSessao = await fetch(BASE + "/api/export/comprovantes");
ok(semSessao.status === 401, "sem sessão -> 401", semSessao.status);

console.log("\n== O PONTO: funciona em SOMENTE LEITURA ==");
await db.query(`UPDATE subscriptions SET status='past_due', current_period_end=now()-($1||$2)::interval WHERE organization_id=$3 AND status='active'`, ["10", " days", org]);
ok((await call("GET", "/api/auth/session", { cookie: A })).d.plan.access.level === "read_only", "igreja em somente leitura");
ok((await call("POST", "/api/financeiro", { cookie: A, body: { type: "income", description: "X", category: "Dízimos", amount: "1.00", transactionDate: "2026-09-06" } })).s === 402, "escrever é recusado");
z = await abrir("/api/export/comprovantes", A);
ok(z.s === 200 && z.crc === true && z.nomes.length > 0, "e o zip sai completo -- a igreja leva o que é dela", `${z.s} ${z.nomes.length}`);

await db.end();
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
