-- O e-mail da PESSOA deixa de ser obrigatório.
--
-- POR QUÊ: o caso é anotar um visitante no corredor da igreja, no domingo, com
-- a pessoa na frente. Ela dá o nome e o telefone; e-mail, quase nunca. Exigir
-- e-mail ali é uma barreira na porta de entrada do cadastro.
--
-- E o dado do próprio banco já dizia isso, medido pelo frontend nas 31 pessoas
-- do nonia_dev: telefone 0, sexo 0, CPF 0, CEP 0, endereço 0, observações 0.
-- E-mail em 31 de 31 -- porque era OBRIGATÓRIO, não porque alguém quis
-- preencher. Campo obrigatório não mede vontade, mede a trava.
--
-- VALE PARA MEMBRO TAMBÉM, e não só para visitante. A assimetria pareceria
-- conservadora e seria pior: converter um visitante sem e-mail em membro
-- funciona (a conversão não revalida o cadastro), e a pessoa vira membro SEM
-- e-mail. Aí, na primeira vez que alguém abrir aquela ficha para corrigir o
-- telefone, o formulário exigiria um e-mail que nunca existiu -- e quem está com
-- a ficha aberta inventa um. É assim que uma base ganha "naotem@naotem.com" em
-- 40% dos registros, poluindo justamente o campo que deveria ser confiável.
--
-- O ÍNDICE ÚNICO PRECISA VIRAR PARCIAL. Sem `WHERE email IS NOT NULL`, a
-- segunda pessoa sem e-mail colidiria com a primeira: em índice único comum o
-- NULL não colide, mas aqui a expressão é `lower(email)` e a coluna passa a
-- aceitar string vazia vinda de fora. O padrão já existe no projeto desde a
-- 001, no CPF -- este é o mesmo caso.

-- Vazio é ausência, e ausência é NULL. Uma string vazia colidiria com outra
-- string vazia no índice; NULL não colide com NULL. Roda antes do índice.
UPDATE people SET email = NULL WHERE email IS NOT NULL AND btrim(email) = '';

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'people'
      AND column_name = 'email' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE people ALTER COLUMN email DROP NOT NULL;
  END IF;
END;
$do$;

DROP INDEX IF EXISTS people_email_org_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS people_email_org_unique_idx
  ON people (organization_id, lower(email)) WHERE email IS NOT NULL;

COMMENT ON COLUMN people.email IS
  'Opcional desde a 014. Único por organização QUANDO preenchido -- ver people_email_org_unique_idx, que é parcial.';
