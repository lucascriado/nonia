-- Citar, encaminhar e mídia nos dois sentidos: o que faltava para a caixa ser
-- "o WhatsApp dele" em vez de um leitor de mensagens.
--
-- TRÊS COLUNAS ENTRAM E UMA SAI, e a que sai é o motivo desta migration existir
-- com este nome.

-- A mensagem CITADA por esta. Guardamos só o id: o texto da citada já está na
-- própria tabela quando ela foi sincronizada, e copiá-lo criaria duas versões
-- do mesmo texto que divergem quando a original é editada ou apagada.
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS quoted_wa_message_id varchar(190);

-- Quem falou, em GRUPO. `author` já guarda o id; ninguém lê id. Sem o nome, uma
-- conversa de grupo vira um monte de balão sem dono.
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS author_name varchar(160);

-- Só do que NÓS enviamos: aí conhecemos o arquivo porque ele passou por aqui.
-- Do que é recebido continuamos sem saber sem baixar, e não baixamos.
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_mimetype varchar(120),
  ADD COLUMN IF NOT EXISTS media_filename varchar(255);

-- QUANDO TENTAMOS resolver o @lid desta conversa para um telefone.
--
-- Não é o telefone: é a data da TENTATIVA, e existe para a tentativa que falha
-- não virar chamada de rede eterna. Resolver um contato é uma requisição ao
-- WhatsApp por conversa; sem marcar que já tentamos, toda conversa que o motor
-- ainda não mapeou seria consultada de novo a cada abertura da caixa, para
-- sempre, e o custo cresceria com o número de conversas que NUNCA vão resolver.
--
-- NULL = nunca tentada. Uma data velha permite tentar de novo um dia (o próprio
-- OpenWA chama a resolução de "best-effort": `phone: null` não afirma que a
-- pessoa não tem número, só que ele ainda não aprendeu o mapa).
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS phone_lookup_at timestamptz;

CREATE INDEX IF NOT EXISTS whatsapp_conversations_sem_telefone_idx
  ON whatsapp_conversations (organization_id, last_message_at DESC NULLS LAST)
  WHERE phone IS NULL;

-- QUARTA MARCA DO MESMO TIPO, e ela é minha.
--
-- `has_media` era gravada na sincronização a partir de `m.media`, que o OpenWA
-- só preenche com `includeMedia=true` -- e nós pedimos o histórico sem mídia,
-- de propósito, para não trazer base64. Ou seja: a coluna era gravada FALSE
-- para toda mensagem, inclusive as que têm foto, e quem lesse depois acreditaria
-- nela. É exatamente `is_new` e `is_recent` de novo: um valor escrito na criação
-- que um leitor posterior trata como verdade atual.
--
-- A cura é a mesma das outras três: não guardar o que dá para DERIVAR. Ter
-- mídia é uma propriedade do TIPO da mensagem (image, video, audio, voice,
-- document, sticker), e o tipo já está na linha ao lado. Uma fonte só, sempre
-- atual, inclusive para as linhas gravadas antes desta migration -- que é a
-- parte que um DEFAULT corrigido não daria.
ALTER TABLE whatsapp_messages DROP COLUMN IF EXISTS has_media;

COMMENT ON COLUMN whatsapp_messages.quoted_wa_message_id IS
  'Id da mensagem citada por esta. Só o id: o texto vive na linha da citada, e copiá-lo criaria duas versões que divergem.';
COMMENT ON COLUMN whatsapp_messages.author_name IS
  'Nome de quem falou, em grupo. `author` guarda o id, e ninguém lê id.';
COMMENT ON COLUMN whatsapp_messages.media_mimetype IS
  'Só do que NÓS enviamos. Do que é recebido, o tipo do arquivo só se conhece baixando -- e o download é sob demanda.';

COMMENT ON COLUMN whatsapp_conversations.phone_lookup_at IS
  'Data da TENTATIVA de resolver o @lid, não o resultado. Sem ela, conversa que nunca resolve vira consulta de rede a cada abertura da caixa.';
