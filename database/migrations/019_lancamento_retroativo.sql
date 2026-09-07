-- A marca de lançamento retroativo.
--
-- ESCOPO: só a marca. O pedido falava em "kardex por conta/carteira", e chegou
-- a virar aqui uma tabela de contas -- descartada em 07/09/2026 depois que o
-- Lucas confirmou que "carteira" é só como ele chama a TELA do financeiro, e
-- não um conceito novo. Não há conta, caixa nem carteira no domínio, e o kardex
-- é o extrato do razão que já existe: leitura e apresentação, sem migration.
--
-- Fica registrado porque a pista estava no repositório e eu passei por ela sem
-- ler: a palavra não aparecia em nenhum .ts, .tsx, .sql ou .mjs. Conceito que
-- não tem nome em lugar nenhum do código provavelmente não é conceito -- é
-- apelido, e apelido se confirma perguntando, não modelando.
--
-- =========================================================================
-- A MARCA É UMA COLUNA, E ISSO É DELIBERADO.
-- =========================================================================
--
-- Não se deduz retroatividade comparando `transaction_date` com "hoje". Três
-- razões, e a terceira sozinha já bastaria:
--
--  1. A comparação responde a pergunta errada. "A data é velha" é sobre o
--     lançamento; "foi lançado depois do fato" é sobre o ATO de lançar. Um
--     acerto de janeiro digitado em janeiro tem data velha hoje e não foi
--     retroativo coisa nenhuma. E a dedução ENVELHECE: o mesmo lançamento
--     mudaria de classificação com o passar do tempo, sem ninguém ter tocado
--     nele. Uma marca gravada não muda sozinha.
--  2. Quem lança SABE, e é a única fonte confiável. A marca é uma declaração,
--     não uma inferência.
--  3. "Hoje" está errado neste sistema por três horas todo dia. As datas são
--     gravadas em UTC e o "hoje" é calculado com toISOString(); entre 21h e
--     meia-noite em Brasília o sistema acha que hoje é amanhã. Uma regra
--     construída em cima dessa comparação erraria todo santo dia, justamente
--     no horário em que a secretaria lança o culto da noite. Defeito conhecido
--     e NÃO consertado aqui -- ver a nota ao pé.
--
-- QUANDO O LANÇAMENTO FOI FEITO já está gravado e está CERTO: é o `created_at`,
-- que é timestamptz, ou seja, um instante absoluto. Lido de volta como
-- `created_at AT TIME ZONE 'America/Sao_Paulo'` ele dá o dia em Brasília sem
-- ambiguidade nenhuma. Por isso não entra coluna nova para "data do registro":
-- ela existiria só para repetir, em tipo pior, o que já está lá.
--
-- Ou seja, o lançamento passa a ter três coisas distintas, e é a distinção que
-- torna o retroativo auditável:
--
--   transaction_date  o dia do FATO         (o que a igreja declara)
--   created_at        o instante do ATO     (o que o sistema observou)
--   retroactive       a DECLARAÇÃO de que um veio depois do outro
--
-- O QUE O BANCO PODE AFIRMAR, E O QUE ELE NÃO PODE. O banco garante a
-- COERÊNCIA da marca: justificativa sem marca não é estado possível. Ele NÃO
-- garante a regra "data velha exige marca", e a ausência é deliberada -- um
-- CHECK contra CURRENT_DATE não é imutável, dependeria do fuso da sessão (o
-- mesmo defeito acima, agora dentro do banco) e passaria a REPROVAR qualquer
-- UPDATE futuro numa linha antiga já gravada e correta. Essa regra mora na
-- API, onde "hoje" pode ser calculado em Brasília e onde recusar tem como
-- explicar o motivo a quem digitou.

ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS retroactive boolean NOT NULL DEFAULT false;
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS retroactive_reason varchar(200);

-- DEFAULT false e não NULL: o que já está gravado não é "retroatividade
-- desconhecida", é lançamento normal. Ninguém tinha como marcar antes de a
-- marca existir, e uma coluna anulável convidaria a tela a inventar um terceiro
-- estado que não corresponde a nada.

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'financial_transactions_retroactive_check'
       AND conrelid = to_regclass('financial_transactions')
  ) THEN
    ALTER TABLE financial_transactions
      ADD CONSTRAINT financial_transactions_retroactive_check
      CHECK (retroactive_reason IS NULL OR retroactive);
  END IF;
END;
$do$;

COMMENT ON COLUMN financial_transactions.retroactive IS
  'DECLARACAO de quem lancou: este lancamento foi feito depois do fato. Nao se deduz de transaction_date -- ver o cabecalho de 019. A regra "data velha exige marca" e da API, nao do banco.';
COMMENT ON COLUMN financial_transactions.retroactive_reason IS
  'Por que foi lancado depois. So existe com retroactive = true (CHECK).';

-- Índice parcial: retroativo é a minoria, e a consulta que importa e "quais
-- lancamentos deste periodo foram feitos depois do fato" -- a conferencia de
-- quem fecha o mes. O parcial nao carrega o peso dos lancamentos normais.
CREATE INDEX IF NOT EXISTS financial_transactions_retroativos_idx
  ON financial_transactions (organization_id, transaction_date DESC)
  WHERE retroactive AND deleted_at IS NULL;

-- -------------------------------------------------------------------------
-- NOTA SOBRE O "HOJE" ERRADO -- lida, e deixada como está de propósito.
-- -------------------------------------------------------------------------
--
-- `transaction_date` nasce de toISOString().slice(0,10) em DOIS lugares
-- (components/financial-record-dialog.tsx:28 e o defaultValue do Model em
-- lib/models.ts), e o default do banco e CURRENT_DATE, que segue o fuso da
-- sessao. Em Brasilia, das 21h a meia-noite, os tres dizem AMANHA.
--
-- Esta migration NAO conserta isso: consertar muda o comportamento do que a
-- igreja ve e do que ja esta gravado, e a decisao nao e de quem escreve a
-- migration. O que ela faz e nao construir nada em cima do defeito -- a
-- retroatividade e declarada, nao deduzida, e o "hoje" da regra na API sai de
-- lib/datas.ts, calculado em Brasilia.
