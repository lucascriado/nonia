-- Remove as permissões people.read e people.write.
--
-- Elas nasceram na 004 e nunca governaram nada: as rotas que mexem em pessoas
-- pedem members.* ou visitors.*, porque `people` é a tabela compartilhada por
-- baixo das duas e nunca teve rota própria.
--
-- Permissão órfã não é inofensiva como coluna órfã. A coluna ninguém vê; a
-- permissão APARECE no seletor de papéis, e prometer um poder que não existe é
-- mentira na interface. O custo de remover é baixo agora justamente porque a
-- tela de papéis acabou de nascer -- quem for convidar alguém já lê a lista
-- limpa.
--
-- Se um dia fizer sentido uma permissão de "pessoa" acima de membros e
-- visitantes, ela se cria aqui de novo, com rota usando.

DELETE FROM permissions WHERE slug IN ('people.read', 'people.write');
