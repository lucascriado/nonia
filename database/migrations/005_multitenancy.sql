-- Retrofit de multi-tenancy: organization_id nas tabelas de domínio.
--
-- Segurança em base com dados (as migrations rodam no boot do container):
--   * nenhuma tabela é removida e nenhuma coluna é apagada;
--   * a coluna nasce anulável, é preenchida e só então vira NOT NULL;
--   * tudo roda na transação da migration -- ou aplica inteira, ou nada;
--   * cada passo é IF NOT EXISTS / condicional, então reaplicar é inócuo.
--
-- Os dados que já existem são atribuídos a uma organização padrão. Numa base
-- vazia (instalação nova) nenhuma organização é criada.

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
-- 1. Colunas (ainda anuláveis)
-- ---------------------------------------------------------------------------
ALTER TABLE people                       ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE ministries                   ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE members                      ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE visitors                     ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE cells                        ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE cell_members                 ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE ministry_attendance_sessions ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE ministry_attendance_records  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE events                       ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE activities                   ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE financial_transactions       ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Quem executou a ação, quando veio de um usuário autenticado.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS actor_user_id uuid;

-- ---------------------------------------------------------------------------
-- 2. Backfill para a organização padrão
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  default_org uuid;
  pending bigint;
BEGIN
  SELECT
      (SELECT count(*) FROM people                       WHERE organization_id IS NULL)
    + (SELECT count(*) FROM ministries                   WHERE organization_id IS NULL)
    + (SELECT count(*) FROM members                      WHERE organization_id IS NULL)
    + (SELECT count(*) FROM visitors                     WHERE organization_id IS NULL)
    + (SELECT count(*) FROM cells                        WHERE organization_id IS NULL)
    + (SELECT count(*) FROM cell_members                 WHERE organization_id IS NULL)
    + (SELECT count(*) FROM ministry_attendance_sessions WHERE organization_id IS NULL)
    + (SELECT count(*) FROM ministry_attendance_records  WHERE organization_id IS NULL)
    + (SELECT count(*) FROM events                       WHERE organization_id IS NULL)
    + (SELECT count(*) FROM activities                   WHERE organization_id IS NULL)
    + (SELECT count(*) FROM financial_transactions       WHERE organization_id IS NULL)
  INTO pending;

  IF pending = 0 THEN
    RAISE NOTICE 'Nenhum registro para migrar; nenhuma organização padrão criada.';
    RETURN;
  END IF;

  SELECT id INTO default_org FROM organizations WHERE slug = 'padrao';

  IF default_org IS NULL THEN
    INSERT INTO organizations (name, slug, status)
    VALUES ('Igreja Padrão', 'padrao', 'active')
    RETURNING id INTO default_org;
    RAISE NOTICE 'Organização padrão criada: %', default_org;
  END IF;

  -- Assinatura em avaliação para a organização padrão.
  INSERT INTO subscriptions (organization_id, plan_id, status, trial_ends_at)
  SELECT default_org, p.id, 'trialing', now() + (p.trial_days || ' days')::interval
  FROM plans p
  WHERE p.slug = 'avaliacao'
    AND NOT EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.organization_id = default_org
        AND s.status IN ('trialing', 'active', 'past_due', 'incomplete')
    );

  -- Raízes do domínio.
  UPDATE people                 SET organization_id = default_org WHERE organization_id IS NULL;
  UPDATE ministries             SET organization_id = default_org WHERE organization_id IS NULL;
  UPDATE cells                  SET organization_id = default_org WHERE organization_id IS NULL;
  UPDATE events                 SET organization_id = default_org WHERE organization_id IS NULL;
  UPDATE activities             SET organization_id = default_org WHERE organization_id IS NULL;
  UPDATE financial_transactions SET organization_id = default_org WHERE organization_id IS NULL;

  -- Dependentes: herdam do pai, não do padrão.
  UPDATE members m SET organization_id = p.organization_id
  FROM people p WHERE p.id = m.person_id AND m.organization_id IS NULL;

  UPDATE visitors v SET organization_id = p.organization_id
  FROM people p WHERE p.id = v.person_id AND v.organization_id IS NULL;

  UPDATE cell_members cm SET organization_id = c.organization_id
  FROM cells c WHERE c.id = cm.cell_id AND cm.organization_id IS NULL;

  UPDATE ministry_attendance_sessions s SET organization_id = mi.organization_id
  FROM ministries mi WHERE mi.id = s.ministry_id AND s.organization_id IS NULL;

  UPDATE ministry_attendance_records ar SET organization_id = s.organization_id
  FROM ministry_attendance_sessions s WHERE s.id = ar.session_id AND ar.organization_id IS NULL;
END;
$do$;

-- ---------------------------------------------------------------------------
-- 3. NOT NULL
-- ---------------------------------------------------------------------------
ALTER TABLE people                       ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE ministries                   ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE members                      ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE visitors                     ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE cells                        ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE cell_members                 ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE ministry_attendance_sessions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE ministry_attendance_records  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE events                       ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE activities                   ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE financial_transactions       ALTER COLUMN organization_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Chaves compostas (id, organization_id) -- alvo das FKs por tenant
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS people_id_org_unique_idx      ON people (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS ministries_id_org_unique_idx  ON ministries (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS cells_id_org_unique_idx       ON cells (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS members_id_org_unique_idx     ON members (person_id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_sessions_id_org_unique_idx
  ON ministry_attendance_sessions (id, organization_id);

-- ---------------------------------------------------------------------------
-- 5. Foreign keys
-- ---------------------------------------------------------------------------
SELECT nonia_add_constraint('people', 'people_organization_fkey',
  'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE');
SELECT nonia_add_constraint('ministries', 'ministries_organization_fkey',
  'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE');
SELECT nonia_add_constraint('members', 'members_organization_fkey',
  'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE');
SELECT nonia_add_constraint('visitors', 'visitors_organization_fkey',
  'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE');
SELECT nonia_add_constraint('cells', 'cells_organization_fkey',
  'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE');
SELECT nonia_add_constraint('cell_members', 'cell_members_organization_fkey',
  'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE');
SELECT nonia_add_constraint('ministry_attendance_sessions', 'attendance_sessions_organization_fkey',
  'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE');
SELECT nonia_add_constraint('ministry_attendance_records', 'attendance_records_organization_fkey',
  'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE');
SELECT nonia_add_constraint('events', 'events_organization_fkey',
  'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE');
SELECT nonia_add_constraint('activities', 'activities_organization_fkey',
  'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE');
SELECT nonia_add_constraint('financial_transactions', 'financial_transactions_organization_fkey',
  'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE');

SELECT nonia_add_constraint('activities', 'activities_actor_user_fkey',
  'FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL');

-- Vínculo opcional entre o usuário e a ficha de pessoa dele na igreja.
SELECT nonia_add_constraint('organization_members', 'organization_members_person_fkey',
  'FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL');

-- FKs compostas: impedem, no próprio banco, que um registro aponte para o
-- registro de outra organização.
SELECT nonia_add_constraint('members', 'members_person_org_fkey',
  'FOREIGN KEY (person_id, organization_id) REFERENCES people (id, organization_id) ON DELETE CASCADE');
SELECT nonia_add_constraint('visitors', 'visitors_person_org_fkey',
  'FOREIGN KEY (person_id, organization_id) REFERENCES people (id, organization_id) ON DELETE CASCADE');
SELECT nonia_add_constraint('cell_members', 'cell_members_cell_org_fkey',
  'FOREIGN KEY (cell_id, organization_id) REFERENCES cells (id, organization_id) ON DELETE CASCADE');
SELECT nonia_add_constraint('cell_members', 'cell_members_member_org_fkey',
  'FOREIGN KEY (member_id, organization_id) REFERENCES members (person_id, organization_id) ON DELETE CASCADE');
SELECT nonia_add_constraint('ministry_attendance_sessions', 'attendance_sessions_ministry_org_fkey',
  'FOREIGN KEY (ministry_id, organization_id) REFERENCES ministries (id, organization_id) ON DELETE CASCADE');
SELECT nonia_add_constraint('ministry_attendance_records', 'attendance_records_session_org_fkey',
  'FOREIGN KEY (session_id, organization_id) REFERENCES ministry_attendance_sessions (id, organization_id) ON DELETE CASCADE');
SELECT nonia_add_constraint('ministry_attendance_records', 'attendance_records_member_org_fkey',
  'FOREIGN KEY (member_id, organization_id) REFERENCES members (person_id, organization_id) ON DELETE CASCADE');

-- ---------------------------------------------------------------------------
-- 6. Unicidade que passa a valer por organização
--
-- O e-mail e o CPF de `people` eram únicos globalmente; agora duas igrejas
-- podem ter a mesma pessoa cadastrada. O mesmo vale para nomes de ministérios
-- e de células.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS people_email_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS people_email_org_unique_idx ON people (organization_id, lower(email));

DROP INDEX IF EXISTS people_cpf_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS people_cpf_org_unique_idx ON people (organization_id, cpf) WHERE cpf IS NOT NULL;

ALTER TABLE ministries DROP CONSTRAINT IF EXISTS ministries_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS ministries_name_org_unique_idx ON ministries (organization_id, name);

ALTER TABLE cells DROP CONSTRAINT IF EXISTS cells_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS cells_name_org_unique_idx ON cells (organization_id, name);

-- ---------------------------------------------------------------------------
-- 7. Índices por tenant (toda consulta filtra por organization_id)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS people_name_search_idx;
CREATE INDEX IF NOT EXISTS people_org_name_idx ON people (organization_id, lower(full_name));

CREATE INDEX IF NOT EXISTS ministries_org_idx                ON ministries (organization_id);
CREATE INDEX IF NOT EXISTS members_org_status_idx            ON members (organization_id, status);
CREATE INDEX IF NOT EXISTS members_org_ministry_idx          ON members (organization_id, ministry_id);
CREATE INDEX IF NOT EXISTS visitors_org_visit_date_idx       ON visitors (organization_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS cells_org_idx                     ON cells (organization_id);
CREATE INDEX IF NOT EXISTS cell_members_org_idx              ON cell_members (organization_id);
CREATE INDEX IF NOT EXISTS attendance_sessions_org_idx       ON ministry_attendance_sessions (organization_id, meeting_date DESC);
CREATE INDEX IF NOT EXISTS attendance_records_org_idx        ON ministry_attendance_records (organization_id);
CREATE INDEX IF NOT EXISTS events_org_starts_at_idx          ON events (organization_id, starts_at);
CREATE INDEX IF NOT EXISTS activities_org_occurred_at_idx    ON activities (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS financial_transactions_org_date_idx
  ON financial_transactions (organization_id, transaction_date DESC);

-- ---------------------------------------------------------------------------
-- 8. Views das listagens, agora expondo o tenant
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS member_directory;
CREATE VIEW member_directory AS
SELECT
  p.id,
  p.organization_id,
  p.full_name,
  p.email,
  p.phone,
  p.birth_date,
  p.gender,
  p.marital_status,
  p.cpf,
  p.zip_code,
  p.address,
  p.neighborhood,
  p.city,
  p.state,
  p.avatar_url,
  p.notes,
  COALESCE(mi.name, 'Nenhum') AS ministry,
  COALESCE(mi.color, 'gray') AS ministry_color,
  m.role,
  m.status,
  m.baptism_status,
  m.baptism_date,
  m.admission_date,
  m.is_new,
  m.created_at,
  m.updated_at,
  m.cell_name
FROM members m
JOIN people p ON p.id = m.person_id
LEFT JOIN ministries mi ON mi.id = m.ministry_id;

DROP VIEW IF EXISTS visitor_directory;
CREATE VIEW visitor_directory AS
SELECT
  p.id,
  p.organization_id,
  p.full_name,
  p.email,
  p.phone,
  p.birth_date,
  p.gender,
  p.marital_status,
  p.cpf,
  p.zip_code,
  p.address,
  p.neighborhood,
  p.city,
  p.state,
  p.avatar_url,
  p.notes,
  v.visit_date,
  v.invited_by,
  v.follow_up_status,
  v.is_recent,
  v.created_at,
  v.updated_at,
  v.membership_stage
FROM visitors v
JOIN people p ON p.id = v.person_id;

DROP FUNCTION IF EXISTS nonia_add_constraint(text, text, text);
