import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("/home/lucas/www/nonia-auth/node_modules/pg");
const c = new Client({ connectionString: process.argv[2] });
await c.connect();

const q = async (label, sql) => {
  const r = await c.query(sql);
  console.log(label, JSON.stringify(r.rows));
};

await q("anulaveis:", `SELECT table_name FROM information_schema.columns
  WHERE column_name = 'organization_id' AND table_schema = 'public' AND is_nullable = 'YES'`);
await q("views com tenant:", `SELECT table_name FROM information_schema.columns
  WHERE column_name = 'organization_id' AND table_name IN ('member_directory','visitor_directory')`);
await q("member_directory:", `SELECT count(*)::int total, count(DISTINCT organization_id)::int orgs FROM member_directory`);
await q("uniques por tenant:", `SELECT indexname FROM pg_indexes WHERE schemaname='public'
  AND indexname IN ('people_email_org_unique_idx','people_cpf_org_unique_idx','ministries_name_org_unique_idx','cells_name_org_unique_idx')
  ORDER BY indexname`);
await q("uniques globais removidos:", `SELECT count(*)::int restantes FROM pg_indexes WHERE schemaname='public'
  AND indexname IN ('people_email_unique_idx','people_cpf_unique_idx')`);
await q("fks compostas:", `SELECT conname FROM pg_constraint WHERE contype='f' AND conname LIKE '%_org_fkey' ORDER BY conname`);
await q("papeis:", `SELECT r.slug, count(rp.permission_slug)::int permissoes FROM roles r
  LEFT JOIN role_permissions rp ON rp.role_id=r.id WHERE r.organization_id IS NULL
  GROUP BY r.slug, r.level ORDER BY r.level DESC`);
await q("permissoes:", `SELECT count(*)::int FROM permissions`);
await c.end();
