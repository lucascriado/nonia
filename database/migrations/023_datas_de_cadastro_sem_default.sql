-- Os defaults de `members.admission_date` e `visitors.visit_date` saem. A
-- aplicação passa a ser a única fonte de "hoje" para as duas.
--
-- ESTA MIGRATION SÓ É SEGURA PORQUE O CÓDIGO JÁ ESTÁ NO AR. Não é uma
-- precaução: é a condição de existência dela, e por isso está escrita aqui.
--
-- O Dockerfile roda "migrate && server". Se o código que passa as colunas e o
-- DROP DEFAULT viajassem no MESMO deploy, a migration removeria o default
-- ANTES de o container novo ficar saudável -- e durante a subida quem atende
-- requisição é o container VELHO, com o código que OMITE as colunas. Um
-- cadastro de membro ou de visitante nessa janela levaria 23502 na cara de
-- quem estava usando o sistema.
--
-- Por isso foram dois deploys, nesta ordem:
--   1. o código passa a mandar as datas (deployado e confirmado em produção,
--      commit b2b388d, /api/health 200, container novo saudável);
--   2. esta migration.
--
-- QUEM OMITE AS COLUNAS DEPOIS DO PASSO 1: ninguém. Os três pontos de criação
-- foram conferidos um a um, e não pelo Model -- pelo SQL que o Sequelize
-- EMITE, porque o Model não diz o que entra no INSERT:
--   app/api/members/route.ts            Member.create   admissionDate
--   app/api/visitors/route.ts           Visitor.create  visitDate
--   app/api/visitors/[id]/convert       Member.create   admissionDate
-- Os três mandam hojeNoFuso(fuso da igreja). O seed de demonstração também
-- passa as duas colunas explicitamente (linhas 87 e 123) -- e isso importa
-- porque produção tem o seed.
--
-- POR QUE REMOVER, E NÃO CONSERTAR: é a mesma impossibilidade da 020, e ela é
-- do PostgreSQL. A expressão de DEFAULT de uma coluna não pode referenciar
-- outra coluna da mesma linha, então o default não alcança `organization_id`
-- para chegar em `organizations.timezone`. O banco NÃO TEM COMO calcular o
-- "hoje" certo destas colunas; qualquer default que ele tenha é, por
-- construção, uma segunda opinião errada.
--
-- MEDIDO, e não é hipótese: em 07/09/2026 às 21h35 em Brasília, `CURRENT_DATE`
-- no nonia_dev e no nonia_front respondia 2026-09-08, com TimeZone de sessão
-- UTC. Visitante cadastrado depois do culto de domingo nascia com a visita de
-- AMANHÃ -- e cadastro de visitante acontece exatamente nessa janela. Membro
-- cadastrado no dia 30 ou 31 caía no MÊS seguinte e sumia do indicador "novos
-- este mês".
--
-- AS COLUNAS CONTINUAM NOT NULL. Omitir deixa de gravar o dia errado em
-- silêncio e passa a FALHAR alto, com violação de NOT NULL. Trocar erro
-- silencioso por erro barulhento é o ponto.
--
-- NÃO TOCA EM LINHA JÁ GRAVADA. DROP DEFAULT muda o que acontece no próximo
-- insert que omitir a coluna, e nada mais. As datas gravadas erradas nas noites
-- anteriores continuam como estão -- corrigi-las seria mexer em cadastro já
-- feito, e isso é decisão do Lucas, não efeito colateral de migration.
--
-- `cell_members.joined_at` FICA COM O DEFAULT, de propósito, e não é
-- esquecimento. Ela tem a mesma doença, mas: é escrita por dois INSERT crus em
-- lib/cell-membership.ts que a omitem, o seed também a omite, e -- o que decide
-- -- ELA NUNCA É LIDA. Varredura em app, lib, components, database e nos CSV:
-- nenhum SELECT, nenhuma rota, nenhuma exportação a menciona. É coluna órfã
-- invisível, e a regra registrada do projeto é que órfã que PROMETE algo sai e
-- órfã invisível fica. Consertá-la seria gravar um valor certo que ninguém olha,
-- ao custo de mexer em três caminhos de escrita. Se um dia ela for lida, entra
-- junto com quem for lê-la.

ALTER TABLE members  ALTER COLUMN admission_date DROP DEFAULT;
ALTER TABLE visitors ALTER COLUMN visit_date     DROP DEFAULT;

COMMENT ON COLUMN members.admission_date IS
  'O dia em que a pessoa passou a ser membro, informado pela aplicacao no fuso da igreja. SEM default: o banco nao alcanca organizations.timezone (DEFAULT nao le outra coluna da linha), entao qualquer default aqui seria uma segunda opiniao errada. Omitir agora FALHA por NOT NULL em vez de gravar o dia errado calado.';
COMMENT ON COLUMN visitors.visit_date IS
  'O dia da visita, informado pela aplicacao no fuso da igreja. SEM default, pelo mesmo motivo de members.admission_date. Era a coluna mais afetada: visitante e cadastrado logo depois do culto de domingo a noite, dentro da janela em que o CURRENT_DATE em UTC ja virou o dia.';
