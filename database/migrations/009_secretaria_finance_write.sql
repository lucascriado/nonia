-- A secretaria passa a lançar no financeiro.
--
-- A permissão nasceu como só leitura por um chute conservador meu, decidido no
-- abstrato. A varredura da jornada mostrou o efeito prático: a secretaria
-- cadastra membro, visitante, célula, ministério e evento, e leva 403 ao
-- lançar o dízimo. Na igreja de verdade isso vira o pastor digitando, ou
-- alguém usando a conta dele -- nenhum dos dois é o que se quer.
--
-- ATENÇÃO ao tamanho do que está sendo concedido: o modelo de permissões tem
-- só `read` e `write`, sem distinguir criar de editar e apagar. Portanto
-- `finance.write` dá à secretaria as TRÊS coisas: lançar, corrigir e EXCLUIR
-- lançamento. Não há como conceder só o lançar sem criar uma permissão nova.
--
-- Owner e admin continuam com finance.write; líder e leitura continuam sem.

INSERT INTO role_permissions (role_id, permission_slug)
SELECT r.id, 'finance.write'
FROM roles r
WHERE r.organization_id IS NULL AND r.slug = 'secretaria'
ON CONFLICT DO NOTHING;

-- A descrição do papel aparece na API e vai aparecer no seletor de convite;
-- "consulta do financeiro" deixou de ser verdade.
UPDATE roles
SET description = 'Cadastros, agenda e lançamentos do financeiro'
WHERE organization_id IS NULL AND slug = 'secretaria';
