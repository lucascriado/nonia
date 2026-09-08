-- Um lançamento dividido em mais de uma forma de pagamento.
--
-- Ex.: uma oferta de R$ 500 em que R$ 300 vieram em dinheiro e R$ 200 no Pix.
-- Hoje só cabe UMA forma, em `financial_transactions.payment_method`.
--
-- =========================================================================
-- O PROBLEMA CENTRAL NÃO É GUARDAR AS PARTES. É NÃO DEIXAR A COLUNA ANTIGA
-- VIRAR MENTIRA.
-- =========================================================================
--
-- A listagem do financeiro, o kardex e o CSV de exportação leem
-- `payment_method` e NÃO vão ser tocados nesta rodada -- é o escopo, e é o
-- certo. Só que isso só é seguro se a coluna continuar dizendo algo honesto
-- SOZINHA, sem quem lê saber que existe uma tabela de partes.
--
-- Três saídas foram consideradas:
--
--   NULL quando dividido        A listagem mostraria a forma em branco num
--                               lançamento que TEM forma. Mentira por omissão,
--                               e a pior das três porque parece "sem dado".
--   uma das formas              "Dinheiro" num lançamento que foi metade Pix.
--                               Meia verdade, indistinguível da verdade.
--   'Dividido'                  ESCOLHIDA. Quem lê a coluna sozinha aprende
--                               exatamente o que aconteceu: houve mais de uma
--                               forma, e o detalhe está em outro lugar.
--
-- Uma quarta, concatenar ("Pix + Dinheiro"), foi descartada: varchar(40)
-- estoura com três ou quatro formas, e cada combinação viraria um valor
-- distinto -- qualquer agrupamento por forma de pagamento, hoje ou amanhã,
-- viraria uma lista de combinações em vez de uma lista de formas.
--
-- E A COERÊNCIA É GARANTIDA PELO BANCO, NÃO PELO FORMULÁRIO. Se 'Dividido'
-- dependesse de a aplicação lembrar de escrevê-lo, bastaria um caminho novo de
-- gravação para a coluna voltar a mentir -- e a mentira seria silenciosa, que é
-- exatamente o que não pode acontecer. As duas direções são verificadas:
-- lançamento com partes TEM que estar 'Dividido', e lançamento 'Dividido' TEM
-- que ter partes. A segunda é fácil de esquecer e é uma mentira igual.
--
-- =========================================================================
-- POR QUE A SOMA PRECISA DE CONSTRAINT TRIGGER DIFERIDA, E NÃO DE UM CHECK
-- =========================================================================
--
-- "A soma das partes fecha com o total" é uma invariante ENTRE LINHAS DE DUAS
-- TABELAS. CHECK não alcança isso: ele enxerga uma linha só.
--
-- E a trigger tem que ser DEFERRABLE INITIALLY DEFERRED. Não é refinamento --
-- sem isso o recurso não funciona nem uma vez. As partes são inseridas uma a
-- uma: no instante em que a primeira parte de 300 entra num lançamento de 500,
-- a soma é 300 e não fecha. Uma verificação imediata reprovaria a primeira
-- linha de TODA divisão. Diferida, ela roda no COMMIT, quando as partes já
-- estão todas lá.
--
-- Esta trigger não é "regra de negócio escondida no banco" -- é uma invariante
-- de integridade, sem segunda implementação em lugar nenhum. É diferente do
-- caso do fuso na 020, onde um trigger duplicaria uma regra que já mora em
-- lib/datas.ts e as duas passariam a discordar.
--
-- =========================================================================
-- ADITIVA. Sem DROP, sem tocar em linha existente.
-- =========================================================================
--
-- Nenhum lançamento que já existe ganha parte nenhuma, e nenhum vira
-- 'Dividido'. Sem partes, tudo continua exatamente como está -- inclusive os
-- lançamentos com `payment_method` NULL, que são "forma não informada" e
-- seguem sendo. Produção está no ar, roda migrate no boot e agora TEM dado.

-- -------------------------------------------------------------------------
-- 1. O alvo da FK composta
-- -------------------------------------------------------------------------
--
-- `financial_transactions` tinha só PRIMARY KEY (id) -- conferido no banco, não
-- suposto. Para ser alvo de FK composta ela precisa de um UNIQUE que carregue o
-- tenant. É o mesmo backstop da 006: com FK simples, um erro na camada de cima
-- poderia pendurar a parte de uma igreja no lançamento de outra e o banco
-- aceitaria.

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'financial_transactions_id_org_key'
       AND conrelid = to_regclass('financial_transactions')
  ) THEN
    ALTER TABLE financial_transactions
      ADD CONSTRAINT financial_transactions_id_org_key UNIQUE (id, organization_id);
  END IF;
END;
$do$;

-- -------------------------------------------------------------------------
-- 2. As partes
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS financial_transaction_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  payment_method varchar(40) NOT NULL,
  amount numeric(12,2) NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Parte de valor zero ou negativo não é parte. O total do lançamento já tem
  -- a mesma regra desde a 003.
  CONSTRAINT financial_transaction_payments_amount_check CHECK (amount > 0),

  -- A mesma forma duas vezes no mesmo lançamento é erro de digitação, não
  -- intenção: "Pix 200 e Pix 300" é "Pix 500". Sem isto a tela mostraria a
  -- mesma forma repetida e ninguém saberia dizer se foi de propósito.
  CONSTRAINT financial_transaction_payments_forma_unica UNIQUE (transaction_id, payment_method),

  -- COMPOSTA, e o ON DELETE CASCADE é o que faz a parte morrer com o
  -- lançamento. Vale notar: a exclusão do financeiro é LÓGICA (deleted_at), e
  -- lançamento excluído mantém as partes -- é a lixeira, e restaurar tem que
  -- devolver o lançamento inteiro.
  CONSTRAINT financial_transaction_payments_transaction_fkey
    FOREIGN KEY (transaction_id, organization_id)
    REFERENCES financial_transactions (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS financial_transaction_payments_transaction_idx
  ON financial_transaction_payments (transaction_id);

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'financial_transaction_payments_set_updated_at'
       AND tgrelid = to_regclass('financial_transaction_payments')
  ) THEN
    CREATE TRIGGER financial_transaction_payments_set_updated_at
      BEFORE UPDATE ON financial_transaction_payments
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$do$;

COMMENT ON TABLE financial_transaction_payments IS
  'As formas de pagamento de UM lancamento, quando foi mais de uma. Lancamento com forma unica NAO tem linha aqui: a forma mora em financial_transactions.payment_method, e duas representacoes do mesmo estado divergiriam.';

-- -------------------------------------------------------------------------
-- 3. A invariante
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION financial_transaction_payments_conferir(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_total numeric(12,2);
  v_forma varchar(40);
  v_soma numeric(12,2);
  v_partes integer;
BEGIN
  SELECT amount, payment_method INTO v_total, v_forma
    FROM financial_transactions WHERE id = p_transaction_id;

  -- O lançamento sumiu no meio da transação (DELETE físico levou as partes por
  -- CASCADE). Não há o que conferir, e reclamar aqui impediria de apagar.
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(sum(amount), 0), count(*) INTO v_soma, v_partes
    FROM financial_transaction_payments WHERE transaction_id = p_transaction_id;

  IF v_partes = 0 THEN
    -- A direção que é fácil esquecer: dizer 'Dividido' sem ter em que dividir.
    IF v_forma = 'Dividido' THEN
      RAISE EXCEPTION 'Lancamento % diz "Dividido" mas nao tem formas de pagamento registradas.', p_transaction_id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN;
  END IF;

  -- Uma parte só não é divisão: é forma única, e forma única mora na coluna
  -- do lançamento. Permitir as duas representações do mesmo estado é garantir
  -- que um dia elas discordem.
  IF v_partes = 1 THEN
    RAISE EXCEPTION 'Lancamento % tem uma forma de pagamento so. Forma unica vai em payment_method, sem linha em financial_transaction_payments.', p_transaction_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_soma <> v_total THEN
    RAISE EXCEPTION 'As formas de pagamento do lancamento % somam % e o total e %.', p_transaction_id, v_soma, v_total
      USING ERRCODE = 'check_violation';
  END IF;

  -- E a coluna antiga não pode mentir para quem a lê sozinha.
  IF v_forma IS DISTINCT FROM 'Dividido' THEN
    RAISE EXCEPTION 'Lancamento % tem % formas de pagamento, entao payment_method precisa ser "Dividido" (esta %).', p_transaction_id, v_partes, COALESCE(v_forma, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION financial_transaction_payments_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_TABLE_NAME = 'financial_transactions' THEN
    PERFORM financial_transaction_payments_conferir(NEW.id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM financial_transaction_payments_conferir(OLD.transaction_id);
  ELSE
    PERFORM financial_transaction_payments_conferir(NEW.transaction_id);
    -- Mover uma parte de um lançamento para outro tem que conferir os DOIS.
    IF TG_OP = 'UPDATE' AND OLD.transaction_id <> NEW.transaction_id THEN
      PERFORM financial_transaction_payments_conferir(OLD.transaction_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$;

DO $do$
BEGIN
  -- Nas PARTES: qualquer mexida muda a soma.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'financial_transaction_payments_invariante'
      AND tgrelid = to_regclass('financial_transaction_payments')
  ) THEN
    CREATE CONSTRAINT TRIGGER financial_transaction_payments_invariante
      AFTER INSERT OR UPDATE OR DELETE ON financial_transaction_payments
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION financial_transaction_payments_trigger();
  END IF;

  -- No LANÇAMENTO, em DOIS gatilhos e não um. A cláusula WHEN é avaliada
  -- ANTES de a função rodar, e por isso NÃO enxerga TG_OP -- um gatilho único
  -- para INSERT e UPDATE não teria como escrever a condição, porque em INSERT
  -- não existe OLD. Medido: "column tg_op does not exist" ao criar.
  --
  -- No INSERT tem que conferir sempre: é o caso de nascer 'Dividido' sem parte
  -- nenhuma.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'financial_transactions_formas_ins'
      AND tgrelid = to_regclass('financial_transactions')
  ) THEN
    CREATE CONSTRAINT TRIGGER financial_transactions_formas_ins
      AFTER INSERT ON financial_transactions
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION financial_transaction_payments_trigger();
  END IF;

  -- No UPDATE, só quando muda o que importa: mudar o total quebra a soma e
  -- mudar a forma quebra o 'Dividido'. Sem o WHEN, toda edição de descrição,
  -- de anexo e toda exclusão lógica pagaria a conferência à toa.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'financial_transactions_formas_upd'
      AND tgrelid = to_regclass('financial_transactions')
  ) THEN
    CREATE CONSTRAINT TRIGGER financial_transactions_formas_upd
      AFTER UPDATE ON financial_transactions
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      WHEN (OLD.amount IS DISTINCT FROM NEW.amount
            OR OLD.payment_method IS DISTINCT FROM NEW.payment_method)
      EXECUTE FUNCTION financial_transaction_payments_trigger();
  END IF;
END;
$do$;

COMMENT ON FUNCTION financial_transaction_payments_conferir(uuid) IS
  'Invariante das formas de pagamento: soma fecha com o total, no minimo duas partes, e payment_method = Dividido nos dois sentidos. Chamada por CONSTRAINT TRIGGER DIFERIDA -- imediata reprovaria a primeira parte de toda divisao.';
