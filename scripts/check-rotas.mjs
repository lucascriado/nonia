#!/usr/bin/env node
// Confere que toda pasta de rota em app/ está classificada em lib/rotas.ts:
// ou é tela do sistema (APP_PAGES) ou é página pública (PUBLIC_PAGES).
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
// As rotas moram direto em app/, sem pasta de agrupamento, então não há pasta
// que diga de que lado cada uma está. Por isso pasta sem classificação é erro,
// e não "pública por omissão": a omissão é justamente o defeito que se caça.
//
// Sai com código 1 quando falta alguma, para servir de verificação.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rotas = await readFile(path.join(raiz, "lib", "rotas.ts"), "utf8");

function lista(nome) {
  const bloco = new RegExp(`const ${nome} = \\[([\\s\\S]*?)\\];`).exec(rotas);
  if (!bloco) {
    console.error(`Não achei o ${nome} em lib/rotas.ts. Este script depende do formato da lista.`);
    process.exit(1);
  }
  return [...bloco[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const doApp = lista("APP_PAGES");
const publicas = lista("PUBLIC_PAGES");

// Fora da conta: api/ (não é tela), _pasta (privada no Next) e (grupo), caso
// algum volte a existir.
const entradas = await readdir(path.join(raiz, "app"), { withFileTypes: true });
const pastas = entradas
  .filter((e) => e.isDirectory() && e.name !== "api" && !/^[_(]/.test(e.name))
  .map((e) => `/${e.name}`)
  .sort();

const lado = (p) => (doApp.includes(p) ? "app" : publicas.includes(p) ? "pública" : null);

console.log(`pastas de rota em app/: ${pastas.length} | APP_PAGES: ${doApp.length} | PUBLIC_PAGES: ${publicas.length}`);
for (const p of pastas) console.log(`  ${lado(p) ? `✔ ${lado(p).padEnd(7)}` : "✖ SEM LADO"} ${p}`);

const semLado = pastas.filter((p) => !lado(p));
const nosDois = doApp.filter((p) => publicas.includes(p));
const sobrando = [...doApp, ...publicas].filter((l) => !pastas.includes(l));

// Página pública sem a moldura abre sem cabeçalho, rodapé nem marketing.css.
const semMoldura = [];
for (const p of publicas.filter((p) => pastas.includes(p))) {
  const layout = await readFile(path.join(raiz, "app", p.slice(1), "layout.tsx"), "utf8").catch(() => "");
  if (!layout.includes("MarketingFrame")) semMoldura.push(p);
}

if (sobrando.length) {
  console.log("\n⚠ listadas em lib/rotas.ts sem pasta correspondente (renomeada ou removida?):");
  for (const l of sobrando) console.log(`  ? ${l}`);
}

if (semLado.length) {
  console.log(
    `\n✖ ${semLado.length} pasta(s) sem lado: ${semLado.join(", ")}\n` +
      "  Tela do sistema vai em APP_PAGES (sem isso abre para quem não tem sessão, em vez de ir\n" +
      "  para /entrar, e fica sem o provider de sessão). Página pública vai em PUBLIC_PAGES.",
  );
  process.exitCode = 1;
}
if (nosDois.length) {
  console.log(`\n✖ nas duas listas ao mesmo tempo: ${nosDois.join(", ")}`);
  process.exitCode = 1;
}
if (semMoldura.length) {
  console.log(
    `\n✖ página(s) pública(s) sem MarketingFrame no layout.tsx: ${semMoldura.join(", ")}\n` +
      "  Sem ele a página abre sem cabeçalho, rodapé e marketing.css.",
  );
  process.exitCode = 1;
}
if (!process.exitCode) console.log("\n✔ toda pasta de rota tem lado, e toda tela do app está protegida.");
