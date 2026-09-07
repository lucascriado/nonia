-- Foto de perfil de quem fala no WhatsApp.
--
-- ENDPOINT CONFERIDO NO REPOSITÓRIO DO OPENWA, não suposto (07/09/2026, em
-- /home/lucas/www/OpenWA):
--
--   GET /api/sessions/:sessionId/contacts/profile-pictures?ids=a,b,c
--       -> { "pictures": { "<id>": "https://pps.whatsapp.net/..." | null } }
--       contact.controller.ts:46 e ProfilePicturesResponseDto.
--       Teto de 50 ids por chamada (PROFILE_PICTURES_MAX_IDS), lookups de 5 em
--       5, com prazo de 8 s por id; id que falha vira null e NÃO derruba o lote.
--
-- O nome do campo é `pictures`, e o valor é URL -- não bytes e não base64. É a
-- mesma armadilha do `qrCode`/`qr`: o campo foi lido do DTO do outro lado.
--
-- ONDE A FOTO MORA: nesta tabela, e não numa nova.
--
-- `whatsapp_contacts` já é "o que sabemos sobre este wa_id, nesta igreja", com a
-- chave (organization_id, wa_id) que serve tanto para quem fala num grupo quanto
-- para o id da conversa individual e para o `@g.us` de um grupo -- do lado do
-- OpenWA a foto de grupo sai da MESMA primitiva de contato (group.service.ts:179).
-- Uma tabela só de foto teria a mesma chave, o mesmo dono e o mesmo ciclo de
-- vida da que já existe.
--
-- POR QUE URL E NÃO OS BYTES. A foto é de terceiro e muda sozinha; guardar os
-- bytes seria arrastar dezenas de KB por contato para dentro do banco da igreja
-- e reescrevê-los a cada validade. É a doença dos 43 MB numa escala maior, e o
-- projeto já a conhece. `people.avatar_url` guarda data URI porque a foto é
-- NOSSA e cabe em 120 KB; esta não é nossa.
--
-- O PREÇO DE GUARDAR A URL, dito por inteiro: a URL do pps.whatsapp.net expira,
-- e quando expirar a imagem quebra no navegador. É por isso que existe
-- `avatar_checked_at` -- e é por isso que a tela precisa cair para as iniciais
-- no `onError` da imagem, não só quando o campo vem nulo. As duas defesas são
-- necessárias: a validade evita a maioria das quebras, o onError cobre o resto.
--
-- TRÊS ESTADOS, E ELES SÃO DIFERENTES:
--
--   avatar_checked_at NULL                 nunca perguntamos pela foto
--   avatar_checked_at preenchido, url NULL perguntamos e não há (ou é privada)
--   avatar_checked_at preenchido, url ok   temos foto, válida até a validade
--
-- É a mesma distinção que `name` já faz nesta tabela, com uma diferença que
-- obriga a coluna própria: a LINHA pode existir por causa do nome, resolvido em
-- outro momento, sem que ninguém tenha perguntado pela foto. Deduzir "já
-- perguntei pela foto" da existência da linha faria a foto nunca ser buscada
-- para quem já tem nome.

ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS avatar_checked_at timestamptz;

COMMENT ON COLUMN whatsapp_contacts.avatar_url IS
  'URL da foto de perfil, como o OpenWA a devolve (pps.whatsapp.net). Expira: a tela cai para as iniciais no onError. NULL com avatar_checked_at preenchido = perguntamos e nao ha.';
COMMENT ON COLUMN whatsapp_contacts.avatar_checked_at IS
  'Quando perguntamos pela FOTO. NULL = nunca perguntamos, e e diferente de perguntar e nao haver. Nao se deduz da existencia da linha: ela pode ter nascido da resolucao do nome.';

-- A consulta da rota de fotos é "destes ids, quais estão vencidos ou nunca
-- foram perguntados". O índice parcial serve exatamente isso e não carrega o
-- peso das linhas que só existem por causa do nome.
CREATE INDEX IF NOT EXISTS whatsapp_contacts_foto_vencida_idx
  ON whatsapp_contacts (organization_id, avatar_checked_at)
  WHERE avatar_checked_at IS NOT NULL;
