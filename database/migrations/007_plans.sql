-- Planos comerciais, com os preços e limites da landing.
--
-- Os limites vivem em colunas do plano, e não em regra espalhada pelo código,
-- porque o checkout do Mercado Pago vai se ancorar neles depois.
--
-- ATENÇÃO: cadastrar o limite não é aplicá-lo. Nada hoje impede o 101º membro
-- no plano Semente nem o 11º usuário no Comunidade. A aplicação do limite é
-- pendência conhecida e está registrada em database/README.md.

-- 'sob consulta' precisa ser distinguível de 'grátis': NULL é preço não
-- publicado, 0 é gratuito de verdade. O CHECK (price_cents >= 0) já aceita
-- NULL, então não precisa mudar.
ALTER TABLE plans ALTER COLUMN price_cents DROP NOT NULL;

COMMENT ON COLUMN plans.price_cents IS 'Centavos. NULL = sob consulta; 0 = gratuito.';
COMMENT ON COLUMN plans.max_people IS 'Teto de pessoas cadastradas. NULL = ilimitado. Ainda NÃO aplicado.';
COMMENT ON COLUMN plans.max_users IS 'Teto de usuários com acesso. NULL = ilimitado. Ainda NÃO aplicado.';

INSERT INTO plans (slug, name, description, price_cents, billing_period, trial_days, max_users, max_people, features, is_active, sort_order) VALUES
  ('semente',    'Semente',    'Para começar: até 100 membros e um administrador.',        0,    'monthly', 0, 1,    100,  '{}'::jsonb,                            true, 1),
  ('comunidade', 'Comunidade', 'Membros ilimitados e até 10 usuários com permissões.',      8900, 'monthly', 0, 10,   NULL, '{}'::jsonb,                            true, 2),
  ('rede',       'Rede',       'Várias congregações e usuários ilimitados. Sob consulta.',  NULL, 'monthly', 0, NULL, NULL, '{"multi_congregacao": true}'::jsonb,   true, 3)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  billing_period = EXCLUDED.billing_period,
  max_users = EXCLUDED.max_users,
  max_people = EXCLUDED.max_people,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

-- 'avaliacao' continua sendo o plano em que toda organização nasce.
UPDATE plans SET sort_order = 0 WHERE slug = 'avaliacao';
