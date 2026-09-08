-- Os responsáveis por realizar um evento.
--
-- NOTA DE NUMERAÇÃO: esta é a 022 e NÃO é a migration dos defaults
-- CURRENT_DATE de members/visitors -- aquela ainda não existe e só será escrita
-- depois de o código que passa as datas estar DEPLOYADO em produção. Quando
-- vier, será a 023. O número é só ordem.
--
-- =========================================================================
-- PLURAL DE VERDADE, ENTÃO É TABELA DE JUNÇÃO.
-- =========================================================================
--
-- Um evento tem vários responsáveis, e vale a pena dizer por que aqui a
-- resposta é essa e no "a que ministérios a pessoa pertence" foi o contrário:
-- lá o schema tinha `members.ministry_id`, UMA coluna anulável numa tabela cuja
-- PK é a pessoa -- singular por construção. Aqui não existe nada, e o fato do
-- mundo é plural. Coluna `responsible_id` em `events` seria o mesmo erro ao
-- contrário: caberia um responsável e a tela prometeria vários.
--
-- =========================================================================
-- O VÍNCULO É COM `people`, NÃO COM `members`.
-- =========================================================================
--
-- Duas razões, e as duas são de olhar o que já existe:
--
--  1. É COMO A CASA FAZ. `ministries.leader_id`, `cells.leader_id`,
--     `members.person_id`, `visitors.person_id`, `organization_members.person_id`
--     e `whatsapp_conversations.person_id` referenciam `people`. Nenhuma tabela
--     de domínio referencia `members` a não ser `cell_members`, que é sobre
--     membresia mesmo.
--  2. É O QUE PRESERVA O HISTÓRICO. `members` é uma FICHA que pode ser apagada
--     sem a pessoa sumir -- é o que a conversão de visitante e a remoção de
--     membro fazem. Apontando para `members`, alguém deixar de ser membro
--     apagaria o vínculo e o evento do ano passado perderia quem o realizou.
--     Apontando para `people`, o vínculo sobrevive: quem organizou o evento
--     organizou, e isso não deixa de ser verdade quando a pessoa sai da lista
--     de membros.
--
-- A tela vai OFERECER membros para escolher -- isso é filtro de quem aparece no
-- seletor, e é decisão dela. O que se GRAVA é a pessoa.
--
-- =========================================================================
-- AS REGRAS DE APAGAR, e por que aqui não cabe o SET NULL da 006.
-- =========================================================================
--
-- A 006 usa `ON DELETE SET NULL (<coluna>)` com LISTA de colunas, e a lista
-- existe para o SET NULL não zerar junto o `organization_id`, que é NOT NULL.
-- Aquilo vale para coluna de ATRIBUTO numa linha de entidade: apagar o líder
-- não pode apagar o ministério, então a linha fica e a coluna esvazia.
--
-- AQUI A LINHA É O VÍNCULO. Ela não tem atributo nenhum além das duas pontas:
-- "este evento tem um responsável que é ninguém" não é um estado do mundo, é
-- lixo. E `person_id` é parte da PRIMARY KEY, ou seja NOT NULL -- SET NULL
-- naquela coluna nem seria possível. Por isso as duas pontas são CASCADE:
--
--   evento apagado  -> os vínculos vão junto. Não sobra vínculo órfão.
--   pessoa apagada  -> os vínculos dela vão junto, e apagar a pessoa NÃO
--                      ESTOURA. Quem estouraria é RESTRICT, e ele deixaria a
--                      remoção de uma pessoa presa a um evento de 2019.
--
-- Vale separar duas coisas que se parecem: "deixar de ser membro" NÃO apaga
-- vínculo nenhum -- é justamente o que a escolha por `people` garante. Só a
-- remoção da PESSOA leva os vínculos, e aí não há nome nenhum a preservar.
--
-- =========================================================================
-- O BACKSTOP DE TENANT, e ele é mais forte do que duas verificações.
-- =========================================================================
--
-- As duas FKs compostas apontam para o MESMO `organization_id` desta linha. O
-- efeito é que a linha só consegue existir se o evento E a pessoa pertencerem
-- àquela organização -- não são duas conferências independentes que alguém
-- pode esquecer de casar, é uma coluna só sustentando as duas pontas. Pessoa de
-- uma igreja num evento de outra é impossível por construção.

-- -------------------------------------------------------------------------
-- 1. `events` precisa ser alvo de FK composta
-- -------------------------------------------------------------------------
--
-- `people (id, organization_id)` já tem índice único desde a 005
-- (`people_id_org_unique_idx`). `events` NÃO tem -- conferido, não suposto.

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'events_id_org_key' AND conrelid = to_regclass('events')
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_id_org_key UNIQUE (id, organization_id);
  END IF;
END;
$do$;

-- -------------------------------------------------------------------------
-- 2. O vínculo
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS event_responsibles (
  event_id uuid NOT NULL,
  person_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- A PK É a regra de "não repete": a mesma pessoa duas vezes no mesmo evento
  -- não é intenção, é clique duplo. Sai de graça e sem constraint extra.
  CONSTRAINT event_responsibles_pkey PRIMARY KEY (event_id, person_id),

  CONSTRAINT event_responsibles_event_fkey
    FOREIGN KEY (event_id, organization_id)
    REFERENCES events (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT event_responsibles_person_fkey
    FOREIGN KEY (person_id, organization_id)
    REFERENCES people (id, organization_id) ON DELETE CASCADE
);

-- A PK já serve "os responsáveis deste evento". Este índice serve o caminho
-- inverso -- "de que eventos esta pessoa é responsável" -- e, principalmente, o
-- DELETE de uma pessoa: o Postgres não indexa a origem de FK sozinho, e sem
-- ele apagar alguém varreria a tabela inteira.
CREATE INDEX IF NOT EXISTS event_responsibles_person_idx
  ON event_responsibles (organization_id, person_id);

COMMENT ON TABLE event_responsibles IS
  'Quem esta encarregado de realizar o evento. Aponta para people e nao para members: deixar de ser membro nao pode apagar quem realizou um evento passado.';
COMMENT ON COLUMN event_responsibles.organization_id IS
  'Sustenta as DUAS FKs compostas. Por ser a mesma coluna nas duas, evento e pessoa sao obrigatoriamente da mesma igreja -- por construcao, nao por duas conferencias separadas.';
