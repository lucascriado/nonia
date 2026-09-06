#!/usr/bin/env node
// Compara as migrations do disco com as aplicadas no banco. Só lê.
//
//   npm run db:status
//
// Existe por causa de um incidente: a migration 008 foi integrada na main e
// não foi aplicada no banco compartilhado. `npm run typecheck` e `npm run
// build` passaram, porque nenhum dos dois toca o banco, e o problema só
// apareceu como 500 em produção de desenvolvimento, com a mensagem
// "column p.max_members does not exist" -- que parece bug de código e não é.
//
// Build passando não é prova de que o schema está aplicado. Isto aqui é.
//
// Sai com código 1 quando há migration pendente, para poder ser usado como
// verificação antes de anunciar uma integração.

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "migrations");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL não está definida.");
  process.exit(1);
}

const client = new Client({ connectionString });

try {
  await client.connect();
} catch (error) {
  console.error(`Não foi possível conectar ao banco: ${error.message}`);
  process.exit(1);
}

try {
  const arquivos = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  const { rows: existe } = await client.query(
    `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS existe`,
  );

  const aplicadas = existe[0].existe
    ? (await client.query("SELECT filename FROM schema_migrations ORDER BY filename")).rows.map((r) => r.filename)
    : [];

  const pendentes = arquivos.filter((f) => !aplicadas.includes(f));
  // O contrário também acontece, ao trocar de branch: o banco tem uma
  // migration aplicada cujo arquivo não existe mais nesta árvore.
  const orfas = aplicadas.filter((f) => !arquivos.includes(f));

  const { rows: info } = await client.query("SELECT current_database() AS banco, version() AS versao");
  console.log(`banco: ${info[0].banco} — ${info[0].versao.split(",")[0]}`);
  console.log(`migrations: ${arquivos.length} no disco, ${aplicadas.length} aplicadas`);

  for (const f of arquivos) {
    console.log(`  ${aplicadas.includes(f) ? "✔" : "✖ PENDENTE"} ${f}`);
  }

  if (orfas.length) {
    console.log("\n⚠ aplicadas no banco mas ausentes desta árvore (troca de branch?):");
    for (const f of orfas) console.log(`  ? ${f}`);
  }

  if (pendentes.length) {
    console.log(`\n✖ ${pendentes.length} migration(s) pendente(s). Rode: npm run db:migrate`);
    process.exitCode = 1;
  } else {
    console.log("\n✔ schema em dia.");
  }
} catch (error) {
  console.error(`Falha ao consultar o estado: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
