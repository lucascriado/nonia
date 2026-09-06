#!/usr/bin/env node
// Cria (ou recria) o acesso de proprietário de uma organização existente.
//
//   node database/create-owner.mjs --email pastor@igreja.com --name "Nome" --password "senha"
//   node database/create-owner.mjs --org minha-igreja --email ... --name ... --password ...
//
// Serve para a organização criada pelo backfill da migration 005, que fica
// com os dados antigos mas sem nenhum usuário. Fora esse caso, use o cadastro
// pela aplicação. O hash é o mesmo formato de lib/passwords.ts.

import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const scrypt = promisify(scryptCallback);

const COST = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const email = arg("email")?.trim().toLowerCase();
const fullName = arg("name")?.trim();
const password = arg("password");
const orgSlug = arg("org", "padrao");
const roleSlug = arg("role", "owner");

if (!email || !fullName || !password) {
  console.error("Uso: node database/create-owner.mjs --email <e-mail> --name <nome> --password <senha> [--org <slug>] [--role <slug>]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("A senha deve ter pelo menos 8 caracteres.");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL não está definida.");
  process.exit(1);
}

const salt = randomBytes(16);
const derived = await scrypt(password, salt, 64, COST);
const passwordHash = ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64"), derived.toString("base64")].join("$");

const client = new Client({ connectionString });
await client.connect();

try {
  await client.query("BEGIN");

  const org = await client.query("SELECT id, name FROM organizations WHERE slug = $1", [orgSlug]);
  if (!org.rowCount) throw new Error(`Organização '${orgSlug}' não encontrada.`);

  const role = await client.query(
    "SELECT id FROM roles WHERE organization_id IS NULL AND slug = $1",
    [roleSlug],
  );
  if (!role.rowCount) throw new Error(`Papel '${roleSlug}' não encontrado.`);

  const user = await client.query(
    `INSERT INTO users (email, full_name, password_hash, status, email_verified_at)
     VALUES ($1, $2, $3, 'active', now())
     ON CONFLICT ((lower(email))) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name,
           status = 'active',
           failed_login_attempts = 0,
           locked_until = NULL
     RETURNING id`,
    [email, fullName, passwordHash],
  );

  await client.query(
    `INSERT INTO organization_members (organization_id, user_id, role_id, status, is_default)
     VALUES ($1, $2, $3, 'active', true)
     ON CONFLICT (organization_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id, status = 'active'`,
    [org.rows[0].id, user.rows[0].id, role.rows[0].id],
  );

  await client.query("COMMIT");
  console.log(`✔ ${email} agora é ${roleSlug} de "${org.rows[0].name}" (${orgSlug}).`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`✖ ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
