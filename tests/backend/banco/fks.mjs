import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("/home/lucas/www/nonia-auth/node_modules/pg");
const c = new Client({ connectionString: process.argv[2] });
await c.connect();
const r = await c.query(`
  SELECT con.conname,
         con.conrelid::regclass::text AS tabela,
         pg_get_constraintdef(con.oid) AS definicao
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE con.contype = 'f' AND ns.nspname = 'public'
    AND con.conrelid::regclass::text IN
      ('members','cells','ministries','organization_members','visitors','cell_members','ministry_attendance_records','ministry_attendance_sessions')
  ORDER BY tabela, con.conname`);
for (const row of r.rows) {
  const composta = /\([^)]*,[^)]*\)\s*REFERENCES/.test(row.definicao);
  console.log((composta ? "[COMPOSTA] " : "[  simples] ") + row.tabela.padEnd(28) + row.conname.padEnd(42) + row.definicao);
}
console.log("\nversao:", (await c.query("SHOW server_version")).rows[0].server_version);
await c.end();
