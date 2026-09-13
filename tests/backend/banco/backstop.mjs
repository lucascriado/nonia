import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("/home/lucas/www/nonia-auth/node_modules/pg");
const c = new Client({ connectionString: process.argv[2] });
await c.connect();
let pass = 0, fail = 0;
const ok = (b, l, e = "") => { b ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };
let sp = 0;
const deveFalhar = async (sql, args, label) => {
  // savepoint: uma violacao de FK aborta a transacao inteira sem isso
  const nome = `sp${++sp}`;
  await c.query(`SAVEPOINT ${nome}`);
  try {
    await c.query(sql, args);
    await c.query(`ROLLBACK TO SAVEPOINT ${nome}`);
    ok(false, label, "-> o UPDATE PASSOU");
  } catch (e) {
    await c.query(`ROLLBACK TO SAVEPOINT ${nome}`);
    ok(e.code === "23503", label, e.code === "23503" ? "(FK barrou)" : e.code);
  }
};

await c.query("BEGIN");
try {
  // organização A = a do seed; organização B = criada aqui
  const A = (await c.query("SELECT id FROM organizations WHERE slug='demo'")).rows[0].id;
  const B = (await c.query("INSERT INTO organizations (name,slug) VALUES ('Igreja Teste','teste-backstop') RETURNING id")).rows[0].id;
  const minB = (await c.query("INSERT INTO ministries (organization_id,name,color) VALUES ($1,'Louvor B','blue') RETURNING id", [B])).rows[0].id;
  const pesB = (await c.query("INSERT INTO people (organization_id,full_name,email) VALUES ($1,'Pessoa B','b@teste.test') RETURNING id", [B])).rows[0].id;
  const memA = (await c.query("SELECT person_id FROM members WHERE organization_id=$1 LIMIT 1", [A])).rows[0].person_id;
  const celA = (await c.query("SELECT id FROM cells WHERE organization_id=$1 LIMIT 1", [A])).rows[0].id;
  const minA = (await c.query("SELECT id FROM ministries WHERE organization_id=$1 LIMIT 1", [A])).rows[0].id;
  const usrA = (await c.query("SELECT user_id FROM organization_members WHERE organization_id=$1 LIMIT 1", [A])).rows[0].user_id;

  console.log("\n== O teste do gerente: SQL direto, cruzando organizações ==");
  await deveFalhar("UPDATE members SET ministry_id=$1 WHERE person_id=$2", [minB, memA],
    "membro de A apontando para ministério de B");
  await deveFalhar("UPDATE cells SET leader_id=$1 WHERE id=$2", [pesB, celA],
    "célula de A com líder de B");
  await deveFalhar("UPDATE ministries SET leader_id=$1 WHERE id=$2", [pesB, minA],
    "ministério de A com líder de B");
  await deveFalhar("UPDATE organization_members SET person_id=$1 WHERE organization_id=$2 AND user_id=$3", [pesB, A, usrA],
    "usuário de A vinculado a pessoa de B");

  console.log("\n== O mesmo, mas dentro da própria organização: tem que passar ==");
  const pesA = (await c.query("SELECT id FROM people WHERE organization_id=$1 LIMIT 1", [A])).rows[0].id;
  await c.query("UPDATE cells SET leader_id=$1 WHERE id=$2", [pesA, celA]);
  ok(true, "célula de A com líder de A");
  await c.query("UPDATE members SET ministry_id=$1 WHERE person_id=$2", [minA, memA]);
  ok(true, "membro de A no ministério de A");

  console.log("\n== A armadilha do SET NULL: exclusão não pode estourar ==");
  await c.query("DELETE FROM people WHERE id=$1", [pesA]);
  const cel = (await c.query("SELECT leader_id, organization_id FROM cells WHERE id=$1", [celA])).rows[0];
  ok(cel.leader_id === null, "excluir a pessoa zerou cells.leader_id");
  ok(cel.organization_id === A, "e PRESERVOU cells.organization_id (o SET NULL por coluna funcionou)", cel.organization_id);

  await c.query("DELETE FROM ministries WHERE id=$1", [minA]);
  const mem = (await c.query("SELECT ministry_id, organization_id FROM members WHERE person_id=$1", [memA])).rows[0];
  ok(mem.ministry_id === null, "excluir o ministério zerou members.ministry_id");
  ok(mem.organization_id === A, "e PRESERVOU members.organization_id", mem.organization_id);

  const om = (await c.query("SELECT person_id FROM organization_members WHERE organization_id=$1 AND user_id=$2", [A, usrA])).rows[0];
  ok(om !== undefined, "o vínculo do usuário sobreviveu à exclusão da pessoa");
} finally {
  await c.query("ROLLBACK");
  console.log("\n(rollback: nada foi gravado no nonia_dev)");
}
console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
await c.end();
process.exit(fail ? 1 : 0);
