import { createRequire } from "node:module";
const require2 = createRequire("/home/lucas/www/nonia-auth/package.json");
const BASE = "http://127.0.0.1:3210";
const call = async (m, p, { body, cookie } = {}) => {
  const h = { "content-type": "application/json" }; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, d: ct.includes("json") ? await r.json().catch(() => null) : null, c: r.headers.get("set-cookie")?.split(";")[0] };
};
// PDF de ~2 MB: o teto do produto. base64 fica ~33% maior que o binário.
const PDF = "data:application/pdf;base64," + Buffer.from("%PDF-1.4\n" + "X".repeat(1_500_000)).toString("base64");
console.log(`  tamanho do data URL por comprovante: ${(Buffer.byteLength(PDF) / 1048576).toFixed(2)} MB`);

const pid = () => {
  const { execSync } = require2("child_process");
  const saida = execSync("pgrep -f 'next-server' | head -20").toString().trim().split("\n");
  for (const p of saida) {
    try { if (require2("fs").readlinkSync(`/proc/${p}/cwd`) === "/home/lucas/www/nonia-auth") return p; } catch {}
  }
  return null;
};
const rssMB = (p) => {
  const linha = require2("fs").readFileSync(`/proc/${p}/status`, "utf8").split("\n").find((l) => l.startsWith("VmRSS"));
  return Number(linha.replace(/\D/g, "")) / 1024;
};
const servidor = pid();
console.log(`  servidor: pid ${servidor}\n`);

const u = Date.now().toString(36);
let r = await call("POST", "/api/auth/register", { body: { organizationName: `Zip ${u}`, fullName: "Tesoureiro", email: `t${u}@x.test`, password: "senha1234" } });
const A = r.c;
await call("POST", "/api/billing/subscribe", { cookie: A, body: { planSlug: "comunidade" } });

const marcos = [10, 50, 100, 200];
let criados = 0;
console.log("  comprovantes | RSS antes | RSS pico | RSS depois | zip baixado | tempo");
console.log("  " + "-".repeat(74));
for (const alvo of marcos) {
  while (criados < alvo) {
    criados += 1;
    await call("POST", "/api/financeiro", { cookie: A, body: {
      type: criados % 2 ? "income" : "expense",
      description: `Comprovante numero ${criados}`,
      category: criados % 2 ? "Dízimos" : "Aluguel",
      amount: "100.00", status: "paid", transactionDate: "2026-09-06",
      attachmentUrl: PDF, attachmentName: `doc${criados}.pdf`,
    } });
  }
  global.gc?.();
  const antes = rssMB(servidor);
  let pico = antes;
  const vigia = setInterval(() => { try { pico = Math.max(pico, rssMB(servidor)); } catch {} }, 40);
  const t0 = Date.now();
  const res = await fetch(BASE + "/api/export/comprovantes", { headers: { cookie: A } });
  const buf = Buffer.from(await res.arrayBuffer());
  const ms = Date.now() - t0;
  clearInterval(vigia);
  await new Promise((r) => setTimeout(r, 400));
  const depois = rssMB(servidor);
  console.log(`  ${String(alvo).padStart(11)}  | ${antes.toFixed(0).padStart(8)} MB | ${pico.toFixed(0).padStart(7)} MB | ${depois.toFixed(0).padStart(9)} MB | ${(buf.length / 1048576).toFixed(0).padStart(8)} MB | ${String(ms).padStart(5)} ms`);
  require2("fs").writeFileSync("/tmp/comprovantes.zip", buf);
}
