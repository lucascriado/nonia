-- Fundação SaaS multi-igreja: organizações (tenants), usuários, sessões,
-- papéis/permissões (RBAC) e o esqueleto de planos/assinaturas.
--
-- O esquema de cobrança é agnóstico ao gateway: as colunas `provider*`
-- guardam o identificador externo (Mercado Pago, etc.) sem que nenhuma
-- regra do domínio dependa de um gateway específico.
--
-- Idempotente: pode ser reaplicada sobre uma base que já contenha estas
-- estruturas sem erro e sem perda de dados. Nenhuma tabela é removida.

-- ---------------------------------------------------------------------------
-- Auxiliar: adiciona constraint só se ainda não existir.
-- ---------------------------------------------------------------------------
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
-- Organizações (tenants)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  slug varchar(80) NOT NULL,
  document varchar(18),
  email varchar(254),
  phone varchar(30),
  status varchar(20) NOT NULL DEFAULT 'active',
  timezone varchar(60) NOT NULL DEFAULT 'America/Sao_Paulo',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_status_check CHECK (status IN ('active', 'suspended', 'canceled')),
  CONSTRAINT organizations_slug_check CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$')
);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_unique_idx ON organizations (slug);
CREATE INDEX IF NOT EXISTS organizations_status_idx ON organizations (status);

-- ---------------------------------------------------------------------------
-- Usuários (identidade global de login)
--
-- O usuário é a identidade; o vínculo com cada igreja fica em
-- organization_members. Isso permite que a mesma pessoa administre mais de
-- uma organização sem duplicar credenciais, mantendo o login por e-mail
-- simples e sem ambiguidade.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(254) NOT NULL,
  password_hash text,
  full_name varchar(160) NOT NULL,
  phone varchar(30),
  avatar_url text,
  status varchar(20) NOT NULL DEFAULT 'active',
  email_verified_at timestamptz,
  last_login_at timestamptz,
  failed_login_attempts smallint NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_status_check CHECK (status IN ('active', 'invited', 'disabled')),
  CONSTRAINT users_avatar_url_base64_check CHECK (
    avatar_url IS NULL OR (
      length(avatar_url) <= 122880
      AND avatar_url ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (lower(email));

-- ---------------------------------------------------------------------------
-- Permissões e papéis (RBAC)
--
-- roles.organization_id NULL identifica papel do sistema, compartilhado por
-- todas as organizações. Papéis customizados por igreja entram na mesma
-- tabela com organization_id preenchido.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  slug varchar(60) PRIMARY KEY,
  resource varchar(40) NOT NULL,
  action varchar(20) NOT NULL,
  description varchar(160) NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  slug varchar(40) NOT NULL,
  name varchar(80) NOT NULL,
  description varchar(200),
  level smallint NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS roles_system_slug_unique_idx ON roles (slug) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS roles_org_slug_unique_idx ON roles (organization_id, slug) WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_slug varchar(60) NOT NULL REFERENCES permissions(slug) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_slug)
);

CREATE INDEX IF NOT EXISTS role_permissions_permission_idx ON role_permissions (permission_slug);

-- ---------------------------------------------------------------------------
-- Vínculo usuário <-> organização (com papel)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  person_id uuid,
  status varchar(20) NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT true,
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id),
  CONSTRAINT organization_members_status_check CHECK (status IN ('active', 'invited', 'suspended'))
);

CREATE INDEX IF NOT EXISTS organization_members_user_idx ON organization_members (user_id);
CREATE INDEX IF NOT EXISTS organization_members_role_idx ON organization_members (role_id);
CREATE UNIQUE INDEX IF NOT EXISTS organization_members_default_unique_idx
  ON organization_members (user_id) WHERE is_default;

-- ---------------------------------------------------------------------------
-- Sessões persistidas (cookie httpOnly guarda o token; aqui fica só o hash)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  ip_address inet,
  user_agent varchar(400),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_unique_idx ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_organization_idx ON sessions (organization_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

SELECT nonia_add_constraint(
  'sessions',
  'sessions_membership_fkey',
  'FOREIGN KEY (organization_id, user_id) REFERENCES organization_members (organization_id, user_id) ON DELETE CASCADE'
);

-- ---------------------------------------------------------------------------
-- Convites para entrar em uma organização
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email varchar(254) NOT NULL,
  full_name varchar(160),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  token_hash text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_status_check CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_hash_unique_idx ON invitations (token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_unique_idx
  ON invitations (organization_id, lower(email)) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS invitations_organization_idx ON invitations (organization_id, status);

-- ---------------------------------------------------------------------------
-- Planos e assinaturas (agnósticos ao gateway)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(40) NOT NULL,
  name varchar(80) NOT NULL,
  description varchar(300),
  price_cents integer NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'BRL',
  billing_period varchar(20) NOT NULL DEFAULT 'monthly',
  trial_days smallint NOT NULL DEFAULT 0,
  max_users integer,
  max_people integer,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plans_billing_period_check CHECK (billing_period IN ('monthly', 'yearly', 'lifetime')),
  CONSTRAINT plans_price_check CHECK (price_cents >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS plans_slug_unique_idx ON plans (slug);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status varchar(20) NOT NULL DEFAULT 'trialing',
  started_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  ended_at timestamptz,
  provider varchar(30),
  provider_customer_id varchar(120),
  provider_subscription_id varchar(120),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_status_check CHECK (
    status IN ('trialing', 'active', 'past_due', 'canceled', 'expired', 'incomplete')
  )
);

-- Uma assinatura vigente por organização; históricas ficam canceladas/expiradas.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_current_unique_idx
  ON subscriptions (organization_id)
  WHERE status IN ('trialing', 'active', 'past_due', 'incomplete');
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_unique_idx
  ON subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_organization_idx ON subscriptions (organization_id);
CREATE INDEX IF NOT EXISTS subscriptions_period_end_idx ON subscriptions (current_period_end);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL,
  currency char(3) NOT NULL DEFAULT 'BRL',
  status varchar(20) NOT NULL DEFAULT 'pending',
  method varchar(20),
  description varchar(160),
  due_date date,
  paid_at timestamptz,
  payer_name varchar(160),
  payer_document varchar(18),
  payer_email varchar(254),
  provider varchar(30),
  provider_payment_id varchar(120),
  external_reference varchar(120),
  checkout_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_payments_status_check CHECK (
    status IN ('pending', 'paid', 'failed', 'refunded', 'canceled', 'expired')
  ),
  CONSTRAINT subscription_payments_method_check CHECK (
    method IS NULL OR method IN ('pix', 'boleto', 'credit_card', 'debit_card', 'transfer', 'manual')
  ),
  CONSTRAINT subscription_payments_amount_check CHECK (amount_cents >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_provider_unique_idx
  ON subscription_payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscription_payments_organization_idx
  ON subscription_payments (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscription_payments_status_idx ON subscription_payments (status);

-- Log de eventos do gateway: garante idempotência de webhooks na integração.
CREATE TABLE IF NOT EXISTS billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(30) NOT NULL,
  provider_event_id varchar(160),
  type varchar(60) NOT NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES subscription_payments(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_provider_unique_idx
  ON billing_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS billing_events_received_at_idx ON billing_events (received_at DESC);

-- ---------------------------------------------------------------------------
-- Triggers de updated_at
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'organizations', 'users', 'roles', 'organization_members', 'invitations',
    'plans', 'subscriptions', 'subscription_payments'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = target || '_set_updated_at' AND tgrelid = target::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
        target || '_set_updated_at', target
      );
    END IF;
  END LOOP;
END;
$do$;

-- ---------------------------------------------------------------------------
-- Dados de referência do RBAC.
--
-- Não é seed de demonstração: sem estas linhas o RBAC não funciona, por isso
-- vivem na migration (o dev_seed.sql continua sendo só demonstração).
-- ---------------------------------------------------------------------------
INSERT INTO permissions (slug, resource, action, description) VALUES
  ('dashboard.read',   'dashboard',    'read',  'Ver a dashboard e os indicadores'),
  ('people.read',      'people',       'read',  'Consultar dados pessoais'),
  ('people.write',     'people',       'write', 'Criar e editar dados pessoais'),
  ('members.read',     'members',      'read',  'Consultar membros'),
  ('members.write',    'members',      'write', 'Criar, editar e excluir membros'),
  ('visitors.read',    'visitors',     'read',  'Consultar visitantes'),
  ('visitors.write',   'visitors',     'write', 'Criar, editar e excluir visitantes'),
  ('cells.read',       'cells',        'read',  'Consultar células'),
  ('cells.write',      'cells',        'write', 'Criar, editar e excluir células'),
  ('ministries.read',  'ministries',   'read',  'Consultar ministérios'),
  ('ministries.write', 'ministries',   'write', 'Criar, editar e excluir ministérios'),
  ('attendance.read',  'attendance',   'read',  'Consultar chamadas de presença'),
  ('attendance.write', 'attendance',   'write', 'Registrar chamadas de presença'),
  ('events.read',      'events',       'read',  'Consultar a agenda'),
  ('events.write',     'events',       'write', 'Criar e excluir eventos'),
  ('finance.read',     'finance',      'read',  'Consultar o financeiro'),
  ('finance.write',    'finance',      'write', 'Lançar, editar e excluir movimentações'),
  ('activities.read',  'activities',   'read',  'Consultar o histórico de atividades'),
  ('users.read',       'users',        'read',  'Listar usuários da organização'),
  ('users.write',      'users',        'write', 'Convidar, editar papéis e remover usuários'),
  ('organization.read','organization', 'read',  'Ver os dados da organização'),
  ('organization.write','organization','write', 'Editar os dados da organização'),
  ('billing.read',     'billing',      'read',  'Ver plano, assinatura e faturas'),
  ('billing.write',    'billing',      'write', 'Contratar, trocar e cancelar o plano')
ON CONFLICT (slug) DO UPDATE
  SET resource = EXCLUDED.resource,
      action = EXCLUDED.action,
      description = EXCLUDED.description;

INSERT INTO roles (organization_id, slug, name, description, level, is_system) VALUES
  (NULL, 'owner',      'Proprietário', 'Acesso total, incluindo plano e cobrança',            100, true),
  (NULL, 'admin',      'Administrador','Acesso total à igreja, sem gerenciar a cobrança',      80, true),
  (NULL, 'secretaria', 'Secretaria',   'Cadastros, agenda e consulta do financeiro',           60, true),
  (NULL, 'lider',      'Líder',        'Células, ministérios, presenças e visitantes',         40, true),
  (NULL, 'leitura',    'Leitura',      'Somente consulta, sem acesso ao financeiro',           20, true)
ON CONFLICT DO NOTHING;

-- owner: todas as permissões.
INSERT INTO role_permissions (role_id, permission_slug)
SELECT r.id, p.slug
FROM roles r CROSS JOIN permissions p
WHERE r.organization_id IS NULL AND r.slug = 'owner'
ON CONFLICT DO NOTHING;

-- admin: tudo, menos alterar a cobrança.
INSERT INTO role_permissions (role_id, permission_slug)
SELECT r.id, p.slug
FROM roles r CROSS JOIN permissions p
WHERE r.organization_id IS NULL AND r.slug = 'admin' AND p.slug <> 'billing.write'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_slug)
SELECT r.id, s.slug
FROM roles r
CROSS JOIN (VALUES
  ('dashboard.read'), ('people.read'), ('people.write'),
  ('members.read'), ('members.write'), ('visitors.read'), ('visitors.write'),
  ('cells.read'), ('cells.write'), ('ministries.read'), ('ministries.write'),
  ('attendance.read'), ('attendance.write'), ('events.read'), ('events.write'),
  ('finance.read'), ('activities.read'), ('users.read'), ('organization.read')
) AS s(slug)
WHERE r.organization_id IS NULL AND r.slug = 'secretaria'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_slug)
SELECT r.id, s.slug
FROM roles r
CROSS JOIN (VALUES
  ('dashboard.read'), ('people.read'),
  ('members.read'), ('visitors.read'), ('visitors.write'),
  ('cells.read'), ('cells.write'), ('ministries.read'),
  ('attendance.read'), ('attendance.write'), ('events.read'),
  ('activities.read'), ('organization.read')
) AS s(slug)
WHERE r.organization_id IS NULL AND r.slug = 'lider'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_slug)
SELECT r.id, s.slug
FROM roles r
CROSS JOIN (VALUES
  ('dashboard.read'), ('people.read'), ('members.read'), ('visitors.read'),
  ('cells.read'), ('ministries.read'), ('attendance.read'), ('events.read'),
  ('activities.read'), ('organization.read')
) AS s(slug)
WHERE r.organization_id IS NULL AND r.slug = 'leitura'
ON CONFLICT DO NOTHING;

-- Plano inicial: toda organização nasce em avaliação. Os planos comerciais
-- serão inseridos quando os preços forem definidos.
INSERT INTO plans (slug, name, description, price_cents, billing_period, trial_days, max_users, max_people, sort_order)
VALUES ('avaliacao', 'Avaliação', 'Período de avaliação gratuito de 14 dias', 0, 'monthly', 14, 5, 200, 0)
ON CONFLICT (slug) DO NOTHING;

DROP FUNCTION IF EXISTS nonia_add_constraint(text, text, text);
