#!/usr/bin/env node
// Confere que toda tela de app/(app) está listada no APP_PAGES do proxy.
//
//   npm run check:rotas
//
// Existe porque APP_PAGES é lista explícita, e lista explícita envelhece
// calada: quem cria uma tela nova não tem por que lembrar de um arquivo que
// não abriu. Já aconteceu com /usuarios, que nasceu fora da lista e abria
// vazia para quem não tinha sessão.
//
// Não é vazamento -- as rotas de app/api recusam sem sessão de qualquer jeito
// -- mas é experiência ruim, e o tipo de coisa que ninguém percebe até alguém
// percorrer. Isto aqui percebe.
//
// Sai com código 1 quando falta alguma, para servir de verificação.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const proxy = await readFile(path.join(raiz, "proxy.ts"), "utf8");

const bloco = /const APP_PAGES = \[([\s\S]*?)\];/.exec(proxy);
if (!bloco) {
  console.error("Não achei o APP_PAGES em proxy.ts. Este script depende do formato da lista.");
  process.exit(1);
}
const listadas = [...bloco[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const dirApp = path.join(raiz, "app", "(app)");
const entradas = await readdir(dirApp, { withFileTypes: true }).catch(() => []);
const telas = entradas
  .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
  .map((e) => `/${e.name}`)
  .sort();

const faltando = telas.filter((t) => !listadas.includes(t));
const sobrando = listadas.filter((l) => !telas.includes(l));

console.log(`telas em app/(app): ${telas.length} | listadas no APP_PAGES: ${listadas.length}`);
for (const t of telas) console.log(`  ${listadas.includes(t) ? "✔" : "✖ FORA DA LISTA"} ${t}`);

if (sobrando.length) {
  console.log("\n⚠ no APP_PAGES sem tela correspondente (renomeada ou removida?):");
  for (const l of sobrando) console.log(`  ? ${l}`);
}

if (faltando.length) {
  console.log(
    `\n✖ ${faltando.length} tela(s) fora do APP_PAGES: ${faltando.join(", ")}\n` +
      "  Sem isso, elas abrem para quem não tem sessão em vez de ir para /entrar.\n" +
      "  Acrescente em proxy.ts.",
  );
  process.exitCode = 1;
} else {
  console.log("\n✔ toda tela do app está protegida.");
}
