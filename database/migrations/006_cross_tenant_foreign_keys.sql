-- Fecha o backstop de multi-tenancy no banco.
--
-- A migration 005 deixou quatro referências de domínio com FK simples, sem
-- organization_id: um UPDATE por SQL direto conseguia apontar um registro
-- para o de outra igreja. As rotas de app/api cobrem todas as quatro hoje
-- (assertBelongsToOrganization, ou o id nem vem do payload), mas a camada de
-- aplicação é a primeira barreira, não a última: a próxima rota escrita sem
-- o assert gravaria dado cruzado em silêncio.
--
--   members.ministry_id            -> ministries (id, organization_id)
--   cells.leader_id                -> people     (id, organization_id)
--   ministries.leader_id           -> people     (id, organization_id)
--   organization_members.person_id -> people     (id, organization_id)
--
-- As quatro são ON DELETE SET NULL. Numa FK composta o SET NULL comum zeraria
-- todas as colunas da chave, inclusive organization_id, que é NOT NULL --
-- excluir uma pessoa passaria a estourar. Por isso usamos a lista de colunas
-- do SET NULL, que existe a partir do PostgreSQL 15.
--
-- REQUISITO: PostgreSQL 15+ (produção e desenvolvimento rodam 18.6).
-- Esta migration eleva o piso do projeto, que até aqui era 13+ por causa do
-- gen_random_uuid() nativo. A verificação abaixo falha com mensagem clara em
-- versão anterior, em vez de dar erro de sintaxe.

DO $do$
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION
      'A migration 006 exige PostgreSQL 15 ou superior (ON DELETE SET NULL com lista de colunas). Versão encontrada: %.',
      current_setting('server_version');
  END IF;
END;
$do$;

CREATE OR REPLACE FUNCTION nonia_add_constraint(p_table text, p_name text, p_definition text)
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = p_name AND conrelid = to_regclass(p_table)
  ) THEN
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', p_table, p_name, p_definition);
  END IF;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 1. Saneamento
--
-- Uma referência cruzada já gravada impediria a criação da constraint. Ela é
-- inválida pelas regras da aplicação de qualquer forma, então vira NULL --
-- que é exatamente o que o ON DELETE SET NULL faria com ela.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  afetadas int;
  total int := 0;
BEGIN
  UPDATE members m SET ministry_id = NULL
  WHERE m.ministry_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM ministries mi
      WHERE mi.id = m.ministry_id AND mi.organization_id = m.organization_id
    );
  GET DIAGNOSTICS afetadas = ROW_COUNT; total := total + afetadas;

  UPDATE cells c SET leader_id = NULL
  WHERE c.leader_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM people p
      WHERE p.id = c.leader_id AND p.organization_id = c.organization_id
    );
  GET DIAGNOSTICS afetadas = ROW_COUNT; total := total + afetadas;

  UPDATE ministries mi SET leader_id = NULL
  WHERE mi.leader_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM people p
      WHERE p.id = mi.leader_id AND p.organization_id = mi.organization_id
    );
  GET DIAGNOSTICS afetadas = ROW_COUNT; total := total + afetadas;

  UPDATE organization_members om SET person_id = NULL
  WHERE om.person_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM people p
      WHERE p.id = om.person_id AND p.organization_id = om.organization_id
    );
  GET DIAGNOSTICS afetadas = ROW_COUNT; total := total + afetadas;

  IF total > 0 THEN
    RAISE NOTICE 'Referências cruzadas entre organizações zeradas: %', total;
  END IF;
END;
$do$;

-- ---------------------------------------------------------------------------
-- 2. Índice de apoio
--
-- A verificação de integridade na exclusão de uma pessoa varre a tabela
-- referenciadora por (person_id, organization_id); as outras três colunas já
-- têm índice desde a 001.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS organization_members_person_idx ON organization_members (person_id);

-- ---------------------------------------------------------------------------
-- 3. As quatro FKs compostas
--
-- A FK simples correspondente é removida: a composta é estritamente mais
-- forte (se o par existe, o id existe), e manter as duas faria dois gatilhos
-- de integridade dispararem na mesma exclusão, com o risco de divergirem.
-- ---------------------------------------------------------------------------
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_ministry_id_fkey;
SELECT nonia_add_constraint('members', 'members_ministry_org_fkey',
  'FOREIGN KEY (ministry_id, organization_id) REFERENCES ministries (id, organization_id) ON DELETE SET NULL (ministry_id)');

ALTER TABLE cells DROP CONSTRAINT IF EXISTS cells_leader_id_fkey;
SELECT nonia_add_constraint('cells', 'cells_leader_org_fkey',
  'FOREIGN KEY (leader_id, organization_id) REFERENCES people (id, organization_id) ON DELETE SET NULL (leader_id)');

ALTER TABLE ministries DROP CONSTRAINT IF EXISTS ministries_leader_id_fkey;
SELECT nonia_add_constraint('ministries', 'ministries_leader_org_fkey',
  'FOREIGN KEY (leader_id, organization_id) REFERENCES people (id, organization_id) ON DELETE SET NULL (leader_id)');

ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_person_fkey;
SELECT nonia_add_constraint('organization_members', 'organization_members_person_org_fkey',
  'FOREIGN KEY (person_id, organization_id) REFERENCES people (id, organization_id) ON DELETE SET NULL (person_id)');

-- ---------------------------------------------------------------------------
-- 4. FKs simples que a 005 deixou duplicando uma composta já existente
--
-- Mesma decisão do bloco anterior, aplicada ao que já estava coberto: uma
-- constraint por referência, e ela é a que carrega o tenant.
-- ---------------------------------------------------------------------------
ALTER TABLE members                     DROP CONSTRAINT IF EXISTS members_person_id_fkey;
ALTER TABLE visitors                    DROP CONSTRAINT IF EXISTS visitors_person_id_fkey;
ALTER TABLE cell_members                DROP CONSTRAINT IF EXISTS cell_members_cell_id_fkey;
ALTER TABLE cell_members                DROP CONSTRAINT IF EXISTS cell_members_member_id_fkey;
ALTER TABLE ministry_attendance_sessions DROP CONSTRAINT IF EXISTS ministry_attendance_sessions_ministry_id_fkey;
ALTER TABLE ministry_attendance_records  DROP CONSTRAINT IF EXISTS ministry_attendance_records_session_id_fkey;
ALTER TABLE ministry_attendance_records  DROP CONSTRAINT IF EXISTS ministry_attendance_records_member_id_fkey;

DROP FUNCTION IF EXISTS nonia_add_constraint(text, text, text);
