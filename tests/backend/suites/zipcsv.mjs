import { createRequire } from "node:module";
const require2 = createRequire("/home/lucas/www/nonia-auth/package.json");
const { execFileSync } = require2("child_process");
const fs = require2("fs");
const crypto = require2("crypto");
const BASE = "http://127.0.0.1:3210";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
const call = async (m, p, { body, cookie } = {}) => {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null, c: r.headers.get("set-cookie")?.split(";")[0] };
};
const abrirZip = async (url, cookie) => {
  const r = await fetch(BASE + url, { headers: { cookie } });
  if (!r.ok) return { s: r.status, d: await r.json().catch(() => null) };
  fs.writeFileSync("/tmp/zc.zip", Buffer.from(await r.arrayBuffer()));
  const j = JSON.parse(execFileSync("python3", ["-c", `
import zipfile,json,base64
z=zipfile.ZipFile('/tmp/zc.zip')
t=z.namelist()
c=[n for n in t if n.lower().endswith('.csv')]
print(json.dumps({'tudo':t,'csv':c[0] if c else None,
  'csvB64': base64.b64encode(z.read(c[0])).decode() if c else None,
  'crc': z.testzip() is None}))`]).toString());
  return { s: r.status, ...j };
};
const PDF = "data:application/pdf;base64," + Buffer.from("%PDF-1.4 x").toString("base64");
const u = Date.now().toString(36);
let r = await call("POST", "/api/auth/register", { body: { organizationName: `ZipCsv ${u}`, fullName: "Tesoureiro", email: `zc${u}@x.test`, password: "senha1234" } });
const A = r.c;
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });
const lancar = (desc, cat, tipo, data, anexo) => call("POST", "/api/financeiro", { cookie: A, body: {
  type: tipo, description: desc, category: cat, amount: "100.00", status: "paid", transactionDate: data,
  ...(anexo ? { attachmentUrl: PDF, attachmentName: "d.pdf" } : {}) } });

await lancar("Dízimos de setembro", "Dízimos", "income", "2026-09-06", true);
await lancar("Aluguel", "Aluguel", "expense", "2026-09-01", true);
await lancar("Oferta SEM comprovante", "Ofertas", "income", "2026-09-03", false);
await lancar("Conta de agosto", "Contas e Utilidades", "expense", "2026-08-15", true);

console.log("== a estrutura de quem abre o zip ==");
let z = await abrirZip("/api/export/comprovantes", A);
console.log("     " + z.tudo.join("\n     "));
ok(z.crc === true, "íntegro");
ok(z.tudo.filter((n) => !n.includes("/")).length === 1, "na raiz há UM arquivo: a planilha", z.tudo.filter((n) => !n.includes("/")).join());
ok(z.tudo.filter((n) => n.startsWith("comprovantes/")).length === 3, "e os comprovantes numa pasta 'comprovantes/'", z.tudo.length);
ok(/^nonia-financeiro-zipcsv-.*-\d{4}-\d{2}-\d{2}\.csv$/.test(z.csv), "a planilha tem o mesmo nome do download avulso", z.csv);

console.log("\n== O CUIDADO: é o MESMO CSV, byte a byte ==");
const avulso = Buffer.from(await (await fetch(BASE + "/api/export/financeiro", { headers: { cookie: A } })).arrayBuffer());
const dentro = Buffer.from(z.csvB64, "base64");
const soma = (b) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);
ok(soma(avulso) === soma(dentro), `mesmo sha256 (${soma(avulso)}) -- um gerador só, não duas versões`, `${soma(avulso)} vs ${soma(dentro)}`);
ok(dentro[0] === 0xef && dentro[1] === 0xbb && dentro[2] === 0xbf, "e mantém o BOM: abre no Excel direto do zip");

console.log("\n== a planilha traz TAMBÉM o que não tem comprovante ==");
const texto = dentro.toString("utf8");
ok(/Oferta SEM comprovante/.test(texto), "o lançamento sem anexo ESTÁ na planilha");
ok(!z.tudo.some((n) => /SEM comprovante/.test(n)), "e NÃO está entre os arquivos, porque não há o que anexar");
const linhaSem = texto.split("\r\n").find((l) => l.includes("Oferta SEM comprovante"));
ok(/;Não;/.test(linhaSem), "e a coluna Comprovante diz 'Não' -- é a lacuna que o conselho procura", linhaSem?.slice(0, 60));

console.log("\n== e reflete o MESMO filtro do zip ==");
z = await abrirZip("/api/export/comprovantes?type=Saída", A);
const t2 = Buffer.from(z.csvB64, "base64").toString("utf8");
ok(z.tudo.filter((n) => n.startsWith("comprovantes/")).length === 2, "zip filtrado: 2 saídas com comprovante", z.tudo.length);
ok(!/Dízimos de setembro/.test(t2), "a planilha dentro também está filtrada -- sem as entradas");
ok(/Aluguel/.test(t2) && /Conta de agosto/.test(t2), "com as saídas do filtro");
// bytes crus dos dois lados: .text() REMOVE o BOM ao decodificar e a
// comparação sairia falsa por causa de três bytes.
const avulsoFiltrado = Buffer.from(await (await fetch(BASE + "/api/export/financeiro?type=Saída", { headers: { cookie: A } })).arrayBuffer());
const dentroFiltrado = Buffer.from(z.csvB64, "base64");
ok(soma(avulsoFiltrado) === soma(dentroFiltrado), "e continua idêntica ao download avulso com o mesmo filtro", `${soma(avulsoFiltrado)} vs ${soma(dentroFiltrado)}`);

console.log("\n== nenhum comprovante: continua sendo mensagem, não zip só com planilha ==");
z = await abrirZip("/api/export/comprovantes?category=Missões", A);
ok(z.s === 404 && z.d?.code === "no_attachments", "404 no_attachments", `${z.s} ${z.d?.code}`);

console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
