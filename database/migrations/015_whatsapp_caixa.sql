-- Caixa de entrada do WhatsApp: conversas e mensagens (bloco 3).
--
-- LEITURA POR CURSOR, NÃO WEBHOOK. Decidido no desenho e reforçado por duas
-- análises independentes: webhook exige que o OpenWA alcance uma URL do nonia,
-- que é a mesma dependência que suspendeu o Mercado Pago, e o túnel reverso
-- esbarra em GatewayPorts no sshd de produção. O OpenWA já persiste as
-- mensagens e oferece cursor de keyset, então dá para ler sem receber.
-- REABRIR SE houver URL pública: aí webhook passa a ser melhor -- mas é
-- decisão nova, não conserto.
--
-- MÍDIA NÃO É COPIADA. O `media.data` do OpenWA vem em base64, e foi isso que
-- fez as listagens chegarem a 43 MB. Guardamos o TIPO, e a prévia mostra
-- "[foto]" em vez de linha vazia -- linha vazia faz quem olha achar que
-- quebrou. O conteúdo continua no OpenWA, que já o guarda sem mídia embutida.
--
-- FONTE DA VERDADE, a mesma da 013: a INTENÇÃO é nossa (a quem a conversa
-- pertence, quem já leu, o que a igreja respondeu); a ENTREGA e o conteúdo são
-- do OpenWA. Quando divergirem, ele vence -- e divergência aqui quase sempre é
-- leitura ainda não feita, e é para isso que o cursor existe.

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- O chat do WhatsApp. Único DENTRO da igreja: o mesmo número pode conversar
  -- com duas igrejas e são duas conversas, não uma. É a mesma razão de
  -- `session_id` ser UNIQUE na 013 -- a conversa é chaveada por (igreja, chat),
  -- nunca por telefone global.
  chat_id varchar(80) NOT NULL,
  kind varchar(20) NOT NULL DEFAULT 'individual',

  -- Nome como o WhatsApp o mostra. Não substitui a ficha: se a pessoa está
  -- cadastrada, a tela mostra o nome DELA.
  wa_name varchar(160),
  phone varchar(40),

  -- CASO NORMAL, não erro. O WhatsApp já identifica gente por @lid (id de
  -- privacidade) em vez de número, e nesses casos NÃO EXISTE TELEFONE para
  -- casar. A tela mostra "não identificado" com ação de vincular ou cadastrar
  -- como visitante. Inventar pessoa aqui seria pior que não ter.
  person_id uuid,

  last_message_at timestamptz,
  last_message_preview varchar(300),
  unread_count integer NOT NULL DEFAULT 0,

  -- Cursor de leitura: o id da última mensagem já trazida do OpenWA. NULL = a
  -- conversa está na lista mas as mensagens dela nunca foram sincronizadas.
  -- É ele que faz a sincronização avançar sem reler tudo.
  sync_cursor varchar(190),
  synced_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT whatsapp_conversations_org_chat_key UNIQUE (organization_id, chat_id),
  CONSTRAINT whatsapp_conversations_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT whatsapp_conversations_person_fkey
    FOREIGN KEY (person_id, organization_id)
    REFERENCES people (id, organization_id) ON DELETE SET NULL (person_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_conversations_org_recent_idx
  ON whatsapp_conversations (organization_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_person_idx
  ON whatsapp_conversations (person_id) WHERE person_id IS NOT NULL;
-- Serve a sincronização em segundo plano: as ainda não sincronizadas, mais
-- recentes primeiro.
CREATE INDEX IF NOT EXISTS whatsapp_conversations_pendentes_idx
  ON whatsapp_conversations (organization_id, last_message_at DESC)
  WHERE sync_cursor IS NULL;

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Id da mensagem no OpenWA. Único por igreja: é o que torna a
  -- sincronização repetível sem duplicar, e é por ele que uma releitura do
  -- mesmo trecho não vira conversa em dobro.
  wa_message_id varchar(190) NOT NULL,

  from_me boolean NOT NULL DEFAULT false,
  author varchar(80),
  type varchar(20) NOT NULL DEFAULT 'text',
  body text,

  -- Só o TIPO da mídia, nunca o conteúdo. Ver o comentário do cabeçalho.
  has_media boolean NOT NULL DEFAULT false,

  sent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT whatsapp_messages_org_wa_key UNIQUE (organization_id, wa_message_id),
  CONSTRAINT whatsapp_messages_conversation_fkey
    FOREIGN KEY (conversation_id, organization_id)
    REFERENCES whatsapp_conversations (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_conversa_idx
  ON whatsapp_messages (conversation_id, sent_at DESC);
-- Serve o teto de sanidade das respostas: contar o que a igreja mandou no
-- último minuto. Contado da TABELA e não de memória, para sobreviver a
-- reinício e não precisar de contador próprio -- mesma técnica que o OpenWA
-- usa no pacing dele.
CREATE INDEX IF NOT EXISTS whatsapp_messages_saida_idx
  ON whatsapp_messages (organization_id, created_at DESC) WHERE from_me;

-- Estado da sincronização da caixa, por igreja. Uma linha, junto da conexão.
ALTER TABLE organization_whatsapp
  ADD COLUMN IF NOT EXISTS chats_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS chats_known integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN whatsapp_conversations.person_id IS
  'Pessoa do cadastro, quando o telefone casa. NULL é caso NORMAL: com @lid pode não existir telefone nenhum.';
COMMENT ON COLUMN whatsapp_messages.has_media IS
  'Só o fato de haver mídia. O conteúdo NUNCA é copiado -- base64 foi o que fez as listagens chegarem a 43 MB.';
