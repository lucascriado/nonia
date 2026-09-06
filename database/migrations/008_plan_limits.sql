-- Renomeia plans.max_people para plans.max_members.
--
-- A landing promete "até 100 membros cadastrados", em quatro lugares. Neste
-- schema, `people` guarda membros E visitantes: aplicar o teto sobre `people`
-- bloquearia uma igreja com 40 membros e 60 visitantes, quebrando a promessa
-- comercial. O teto é de membros, e a coluna passa a dizer isso.
--
-- Renomear é seguro agora justamente porque nenhuma rota lia a coluna -- essa
-- era a pendência. Depois de existir código lendo, sairia caro.

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plans' AND column_name = 'max_people'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plans' AND column_name = 'max_members'
  ) THEN
    ALTER TABLE plans RENAME COLUMN max_people TO max_members;
  END IF;
END;
$do$;

COMMENT ON COLUMN plans.max_members IS
  'Teto de membros (tabela members). NULL = ilimitado. Visitantes não contam.';
COMMENT ON COLUMN plans.max_users IS
  'Teto de assentos de acesso: vínculos não suspensos + convites pendentes. NULL = ilimitado.';
