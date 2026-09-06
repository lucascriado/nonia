-- Exclusão lógica no financeiro.
--
-- Lançamento é dado contábil: sumia para sempre, sem lixeira e sem backup, e
-- desde a 009 a secretaria também alcança o botão. O enquadramento que levou a
-- isto: o problema não é QUEM pode apagar, é O QUE ACONTECE quando se apaga.
-- Com volta, a permissão deixa de ser risco.
--
-- Só o financeiro por enquanto, de propósito: mede-se o custo real aqui antes
-- de estender a membros e visitantes.
--
-- `deleted_by` guarda quem apagou. ON DELETE SET NULL porque a saída do
-- usuário da plataforma não pode apagar o lançamento nem travar a remoção.

ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS deleted_by uuid;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_transactions_deleted_by_fkey'
      AND conrelid = to_regclass('financial_transactions')
  ) THEN
    ALTER TABLE financial_transactions
      ADD CONSTRAINT financial_transactions_deleted_by_fkey
      FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END;
$do$;

COMMENT ON COLUMN financial_transactions.deleted_at IS
  'Exclusão lógica. NULL = ativo. Toda leitura de lançamento filtra por NULL.';

-- A listagem normal é sempre "não excluídos": o índice parcial serve
-- exatamente essa consulta e não carrega o peso morto da lixeira.
CREATE INDEX IF NOT EXISTS financial_transactions_org_ativos_idx
  ON financial_transactions (organization_id, transaction_date DESC)
  WHERE deleted_at IS NULL;

-- E a lixeira tem a sua, ordenada por quando foi excluído.
CREATE INDEX IF NOT EXISTS financial_transactions_org_excluidos_idx
  ON financial_transactions (organization_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;
