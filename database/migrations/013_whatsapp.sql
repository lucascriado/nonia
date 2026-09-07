-- WhatsApp: conexão da igreja (bloco 1) e envio em massa (bloco 2).
--
-- Desenho aprovado em 06/09/2026. O que esta migration materializa:
--
-- UMA SESSÃO POR IGREJA, E ISSO É O ISOLAMENTO. Uma sessão do WhatsApp É um
-- número de telefone. Duas igrejas na mesma sessão são duas igrejas no mesmo
-- número, e a mensagem que chega não tem NENHUM campo que diga de qual igreja
-- ela é -- o destinatário é o mesmo para as duas. Não existe regra derivável
-- do dado, então qualquer desempate seria chute, e chute aqui é conversa de
-- uma igreja aparecendo na outra. O UNIQUE em `session_id` é o backstop de
-- banco disso: duas organizações não apontam para a mesma sessão nem por
-- engano, do mesmo jeito que as FKs compostas impedem gravação cruzada.
--
-- A CHAVE DO OPENWA É GUARDADA CIFRADA. É a primeira credencial REVERSÍVEL do
-- projeto -- senha é scrypt e sessão é SHA-256, nenhuma das duas volta. Esta
-- volta, porque precisa ser reenviada ao OpenWA a cada chamada. Por isso ela
-- é cifrada com AES-256-GCM por `lib/whatsapp/secrets.ts`, e a conexão se
-- RECUSA a existir sem a variável de ambiente que a cifra: sem ela não há
-- gravação em claro como consolo, há recusa.
--
-- Cada igreja tem uma chave PRÓPRIA no OpenWA, restrita à sessão dela
-- (`allowedSessions`). É a segunda camada: um erro de escopo aqui dentro não
-- alcança a sessão de outra igreja, porque o OUTRO LADO recusa.

CREATE TABLE IF NOT EXISTS organization_whatsapp (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

  -- O UNIQUE é a regra de isolamento, não um índice de desempenho.
  session_id varchar(64) NOT NULL UNIQUE,
  session_name varchar(100) NOT NULL,

  -- Id da chave no OpenWA, guardado para conseguir REVOGAR ao desconectar.
  -- Sem ele, desconectar deixaria uma chave viva que ninguém sabe apagar.
  api_key_id varchar(64),
  -- Ciframos o valor; o prefixo fica em claro só para aparecer em log e tela
  -- sem revelar nada (é o que o próprio OpenWA expõe como `keyPrefix`).
  api_key_encrypted text NOT NULL,
  api_key_prefix varchar(12),

  -- Últimos fatos conhecidos, atualizados na leitura. Não são a verdade: a
  -- verdade está no OpenWA e é consultada. Servem para a tela ter o que
  -- mostrar antes da primeira resposta e para o aviso saber que há o que dizer.
  status varchar(30) NOT NULL DEFAULT 'created',
  phone varchar(20),
  push_name varchar(100),
  connected_at timestamptz,
  last_checked_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN organization_whatsapp.session_id IS
  'Sessão do OpenWA desta igreja. UNIQUE de propósito: sessão compartilhada entre igrejas não tem como ser desambiguada.';
COMMENT ON COLUMN organization_whatsapp.api_key_encrypted IS
  'Chave do OpenWA restrita a esta sessão, cifrada em AES-256-GCM. Nunca devolvida por rota nenhuma.';
COMMENT ON COLUMN organization_whatsapp.status IS
  'Último status visto no OpenWA. Cache de leitura: quem manda é o OpenWA.';

-- ---------------------------------------------------------------------------
-- Envio em massa
-- ---------------------------------------------------------------------------
--
-- FONTE DA VERDADE, que foi o ponto levantado na aprovação e vai reaparecer:
--
--   INTENÇÃO   é daqui. Quem foi selecionado, com que filtro, que texto, por
--              quem, quando. O OpenWA não sabe nada disso e nunca vai saber.
--   ENTREGA    é do OpenWA. Ele foi quem falou com o WhatsApp; a coluna
--              `status` de cada destinatário aqui é CÓPIA da resposta dele.
--
-- Quando as duas divergirem, a de entrega do OpenWA vence -- e divergência
-- normalmente não é conflito, é leitura ainda não feita: a linha daqui só
-- muda quando alguém lê o lote de lá. Por isso `wa_batch_id` fica gravado: é
-- o que permite reler e reconciliar em vez de adivinhar.

CREATE TABLE IF NOT EXISTS whatsapp_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  message text NOT NULL,

  -- O filtro que a pessoa estava vendo, como veio. Guardado para a tela poder
  -- dizer "para quem foi" meses depois, sem depender de alguém lembrar.
  audience varchar(20) NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,

  status varchar(20) NOT NULL DEFAULT 'pending',

  -- `total` é INTENÇÃO: quantas pessoas o filtro alcançou no momento do envio.
  -- É um fato daquele instante e por isso fica gravado.
  total integer NOT NULL DEFAULT 0,

  -- Entregues, falhas e pulados NÃO ficam gravados aqui, de propósito. Eles são
  -- contados na leitura a partir de `whatsapp_broadcast_recipients`.
  --
  -- Cheguei a gravá-los e o teste pegou o defeito na hora: quando o despacho
  -- falha (sessão fora do ar), o recontador não roda e a tela mostra "0
  -- pulados" com três linhas puladas na tabela. É a mesma doença do `is_new` e
  -- do `is_recent` -- número gravado num momento que alguém depois lê como se
  -- fosse atual --, agora em contador. Derivar remove a possibilidade em vez de
  -- conferir que ela não aconteceu.

  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT whatsapp_broadcasts_status_check
    CHECK (status IN ('pending', 'running', 'done', 'canceled', 'failed')),
  CONSTRAINT whatsapp_broadcasts_audience_check
    CHECK (audience IN ('members', 'visitors')),
  -- Referência composta, como toda referência de domínio deste schema.
  CONSTRAINT whatsapp_broadcasts_id_org_key UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_broadcasts_org_idx
  ON whatsapp_broadcasts (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- A pessoa pode ter sido excluída depois do envio; o registro do que a
  -- igreja fez não some junto. Por isso ON DELETE SET NULL na coluna, e por
  -- isso `name` e `phone` ficam gravados aqui em vez de serem lidos de lá.
  person_id uuid,
  name varchar(160) NOT NULL,
  phone varchar(40),

  -- O chatId exato que foi despachado. Existe para a reconciliação casar a
  -- resposta do OpenWA com a linha certa POR IGUALDADE. A alternativa era
  -- reconhecer o destinatário pelo fim do telefone, que funciona até duas
  -- pessoas terminarem igual -- e aí marca a mensagem de uma como entrega da
  -- outra, em silêncio.
  chat_id varchar(80),

  status varchar(20) NOT NULL DEFAULT 'pending',
  wa_batch_id varchar(80),
  wa_message_id varchar(190),
  error_code varchar(60),
  error_message varchar(300),
  sent_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT whatsapp_broadcast_recipients_status_check
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  CONSTRAINT whatsapp_broadcast_recipients_broadcast_fkey
    FOREIGN KEY (broadcast_id, organization_id)
    REFERENCES whatsapp_broadcasts (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_broadcast_recipients_person_fkey
    FOREIGN KEY (person_id, organization_id)
    REFERENCES people (id, organization_id) ON DELETE SET NULL (person_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_broadcast_recipients_broadcast_idx
  ON whatsapp_broadcast_recipients (broadcast_id, status);
CREATE INDEX IF NOT EXISTS whatsapp_broadcast_recipients_batch_idx
  ON whatsapp_broadcast_recipients (wa_batch_id) WHERE wa_batch_id IS NOT NULL;

COMMENT ON COLUMN whatsapp_broadcast_recipients.phone IS
  'Telefone como estava no cadastro NO MOMENTO do envio. Mudar a ficha depois não reescreve o histórico.';

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
--
-- TRÊS, e não duas. O modelo só tem read e write, e foi essa granularidade
-- grossa que obrigou a 009 a conceder exclusão junto com lançamento. Aqui a
-- diferença é maior ainda: responder UMA conversa e disparar para QUINHENTAS
-- pessoas não têm o mesmo peso, e mensagem enviada não volta -- não existe
-- lixeira para isso, como existe no financeiro desde a 011.
--
-- Por isso `whatsapp.broadcast` nasce separada, e só para owner e admin.

INSERT INTO permissions (slug, resource, action, description) VALUES
  ('whatsapp.read',      'whatsapp', 'read',      'Ver a conexão e as conversas do WhatsApp'),
  ('whatsapp.write',     'whatsapp', 'write',     'Conectar o WhatsApp e responder conversas'),
  ('whatsapp.broadcast', 'whatsapp', 'broadcast', 'Disparar mensagem em massa para a lista')
ON CONFLICT (slug) DO NOTHING;

-- Leitura: quem já consulta cadastro consulta a conversa.
INSERT INTO role_permissions (role_id, permission_slug)
SELECT r.id, 'whatsapp.read'
FROM roles r
WHERE r.organization_id IS NULL AND r.slug IN ('owner', 'admin', 'secretaria')
ON CONFLICT DO NOTHING;

-- Escrita (conectar e responder): a secretaria é justamente quem atende.
INSERT INTO role_permissions (role_id, permission_slug)
SELECT r.id, 'whatsapp.write'
FROM roles r
WHERE r.organization_id IS NULL AND r.slug IN ('owner', 'admin', 'secretaria')
ON CONFLICT DO NOTHING;

-- Massa: só owner e admin. Abrir para a secretaria depois é uma linha;
-- recolher depois de um envio errado é impossível.
INSERT INTO role_permissions (role_id, permission_slug)
SELECT r.id, 'whatsapp.broadcast'
FROM roles r
WHERE r.organization_id IS NULL AND r.slug IN ('owner', 'admin')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Categoria no histórico de atividades
-- ---------------------------------------------------------------------------
--
-- Disparar para 500 pessoas é a ação mais visível que a igreja pode tomar, e
-- ela precisa ter categoria PRÓPRIA no histórico: enfiada em 'system' viraria
-- ruído no meio de login e troca de senha, justamente na busca em que alguém
-- vai querer achá-la ("o que foi que a gente mandou no dia tal?").
--
-- Idempotente pelo DROP ... IF EXISTS, ao contrário da 003 -- que rodou em base
-- limpa e por isso não precisou.

ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_category_check;
ALTER TABLE activities ADD CONSTRAINT activities_category_check
  CHECK (category IN ('members', 'visitors', 'calendar', 'system', 'financial', 'whatsapp'));
