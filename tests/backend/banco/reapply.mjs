import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("/home/lucas/www/nonia-auth/node_modules/pg");
const c = new Client({ connectionString: process.argv[2] });
await c.connect();
const before = await c.query(`SELECT (SELECT count(*) FROM people) p,(SELECT count(*) FROM organizations) o,(SELECT count(*) FROM financial_transactions) f`);
for (const f of ["database/migrations/004_auth_and_billing.sql", "database/migrations/005_multitenancy.sql"]) {
  await c.query("BEGIN");
  await c.query(fs.readFileSync(f, "utf8"));
  await c.query("COMMIT");
  console.log("reaplicada sem erro:", f.split("/").pop());
}
const after = await c.query(`SELECT (SELECT count(*) FROM people) p,(SELECT count(*) FROM organizations) o,(SELECT count(*) FROM financial_transactions) f`);
console.log("antes:", before.rows[0], "depois:", after.rows[0]);
await c.end();
