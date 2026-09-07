-- Quem falou, em grupo, com NOME.
--
-- MEDIDO em 07/09/2026 contra a conta real: `author` vem preenchido em 655 de
-- 655 mensagens de grupo, e `author_name` vem VAZIO em 655 de 655. O nome sai do
-- `notifyName` do payload cru, que existe no evento AO VIVO e não no histórico
-- lido por `fetchMessages` -- e o histórico é por onde a caixa carrega tudo.
-- Resultado: grupo virava um monte de balão sem dono, justamente nas conversas
-- com mais gente.
--
-- POR QUE UMA TABELA, E NÃO UMA COLUNA A MAIS NA MENSAGEM:
--
--  1. O nome é de UMA PESSOA, não de uma mensagem. Num grupo de 200 participantes
--     com 5.000 mensagens, guardar por mensagem seria repetir o mesmo nome
--     milhares de vezes e ter que reescrever todas quando ele mudasse.
--  2. Resolver custa UMA REQUISIÇÃO DE REDE por participante. Sem um lugar para
--     dizer "já perguntei por este", um grupo grande vira uma consulta por
--     participante a cada abertura da conversa, para sempre. É exatamente o que
--     `phone_lookup_at` impede do lado do @lid, e é a mesma doença.
--
-- A LINHA EXISTIR é a memória: já perguntamos. `name` NULL é resposta legítima
-- -- perguntamos e o motor não sabe --, e é diferente de não ter perguntado, que
-- é a linha não existir. Essa distinção é o ponto inteiro da tabela.
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- O id de quem falou, como o WhatsApp o entrega: `@lid` hoje, `@c.us` antes.
  -- Não é telefone e não se supõe que seja.
  wa_id varchar(80) NOT NULL,

  -- Nome salvo na agenda, ou o de exibição. NULL = perguntamos e não há.
  name varchar(160),

  looked_up_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Por igreja, e não global: o mesmo número pode falar em grupos de duas
  -- igrejas, e o nome que uma delas conhece não é dado da outra.
  CONSTRAINT whatsapp_contacts_pkey PRIMARY KEY (organization_id, wa_id)
);

COMMENT ON TABLE whatsapp_contacts IS
  'Nome de quem fala em grupo, resolvido sob demanda. A LINHA EXISTIR é a memória de "já perguntei"; name NULL é "perguntei e não há".';
COMMENT ON COLUMN whatsapp_contacts.name IS
  'NULL é resposta, não ausência de resposta: o motor foi consultado e não soube. Não ter perguntado é a linha não existir.';
