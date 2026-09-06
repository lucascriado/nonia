# Banco de dados PostgreSQL

As migrations desta pasta preparam o banco do Nonia do zero. Elas são a fonte
de verdade do schema.

**Requer PostgreSQL 15+.** O piso era 13, por causa do `gen_random_uuid()`
nativo, e subiu na `006`, que usa `ON DELETE SET NULL` com lista de colunas. A
própria `006` confere a versão e falha com mensagem clara em servidor anterior.
Produção e desenvolvimento rodam 18.6, e o `docker-compose.yml` usa `18-alpine`.

## Estrutura

- `migrations/001_initial_schema.sql`: tabelas, constraints, índices e triggers.
- `migrations/002_directory_views.sql`: views `member_directory` e `visitor_directory`.
- `migrations/003_financial_transactions.sql`: tabela `financial_transactions`
  e extensão da categoria `financial` em `activities`.
- `migrations/004_auth_and_billing.sql`: organizações, usuários, sessões,
  papéis e permissões (RBAC), convites e o esqueleto de planos/assinaturas.
- `migrations/005_multitenancy.sql`: `organization_id` nas tabelas de domínio,
  com backfill dos dados existentes para uma organização padrão.
- `migrations/006_cross_tenant_foreign_keys.sql`: fecha o backstop, trocando as
  FKs simples entre tabelas de domínio por FKs compostas com `organization_id`.
- `migrations/007_plans.sql`: os planos comerciais com preços e limites.
- `seeds/dev_seed.sql`: dados de demonstração (apenas para desenvolvimento).
  Cria a organização `demo` com acesso `demo@nonia.app` / `demo1234`.
- `migrate.mjs`: executor de migrations multiplataforma (Node).

## Executar

Defina `DATABASE_URL` e execute:

```bash
npm run db:migrate       # aplica migrations pendentes
npm run db:seed:dev      # migrations + seed de demonstração
```

O executor mantém a tabela `schema_migrations` e ignora arquivos já aplicados.
Em produção as migrations rodam automaticamente na inicialização do
container, então **toda migration precisa ser segura e idempotente sobre uma
base com dados**: nada de dropar tabela, coluna nova nasce anulável e só vira
`NOT NULL` depois do backfill.

`npm run auth:owner -- --email <e> --name <n> --password <s>` cria o
proprietário de uma organização que ficou sem usuário — o caso da organização
gerada pelo backfill da `005`.

Para mudar o schema, crie uma nova migration numerada (`008_...sql`).
Não altere migrations já aplicadas.

## Backend Node e Sequelize

As rotas em `app/api` usam Sequelize v6 sobre o driver `pg`. A instância
compartilhada e o pool ficam em `lib/db.ts`; os Models ficam em `lib/models.ts`.
O CRUD de membros e visitantes usa Models e transações Sequelize.

Consultas agregadas e views continuam usando SQL explícito por clareza. Não use
`sequelize.sync()`: mudanças de schema devem ser feitas com uma nova migration
SQL em `database/migrations/`.

Em desenvolvimento local, mantenha o PostgreSQL fechado para a internet. Se o
banco estiver em um servidor remoto, use um túnel SSH:

```bash
ssh -N -L 15432:127.0.0.1:5432 usuario@servidor
```

Depois aponte `DATABASE_URL` para `127.0.0.1:15432`.

## Multi-tenancy

Cada igreja é uma linha em `organizations` e toda tabela de domínio tem
`organization_id NOT NULL`. São duas camadas, e as duas importam:

1. **Aplicação** — toda rota de `app/api` começa por `requirePermission(...)` e
   usa `organizationId(auth)` em todo SELECT, UPDATE, DELETE e INSERT. Id que
   chega pelo payload passa por `assertBelongsToOrganization` (400 `cross_tenant`);
   id que vem na URL passa por `assertOwnedResource` (404, para não confirmar
   que o id existe em outra organização).
2. **Banco** — desde a `006` toda referência entre tabelas de domínio é uma FK
   **composta** `(id, organization_id)`, e não sobrou nenhuma FK simples entre
   elas. Um `UPDATE` por SQL direto cruzando organizações é recusado pelo banco,
   não só pela aplicação.

As quatro referências opcionais (`members.ministry_id`, `cells.leader_id`,
`ministries.leader_id`, `organization_members.person_id`) usam
`ON DELETE SET NULL (<coluna>)`. A lista de colunas não é enfeite: sem ela o
`SET NULL` zeraria também `organization_id`, que é `NOT NULL`, e excluir uma
pessoa passaria a estourar.

## Identidade e sessão

`users` é a identidade de login, com e-mail único no sistema todo. O vínculo com
a igreja e o papel ficam em `organization_members`, então a mesma pessoa
administra mais de uma igreja sem duplicar credencial.

A sessão é um token opaco de 256 bits no cookie `nonia_session`; o banco guarda
só o SHA-256 dele. **Não existe `AUTH_SECRET`** — não há nada assinado.

A senha usa `scrypt` do `node:crypto` (`lib/passwords.ts`), escolhido por não
exigir dependência nativa no build standalone. O hash carrega os próprios
parâmetros de custo, então dá para endurecer depois sem invalidar senha antiga.

Papéis do sistema: `owner`, `admin`, `secretaria`, `lider`, `leitura`. As
permissões são pares `recurso.acao` em `permissions` e `role_permissions`.

## Planos

Os limites são **dado**, em colunas de `plans`, e não regra espalhada pelo
código — o checkout do Mercado Pago vai se ancorar neles.

| slug | preço | `max_people` | `max_users` |
| --- | --- | --- | --- |
| `avaliacao` | 0, por 14 dias | 200 | 5 |
| `semente` | 0 | 100 | 1 |
| `comunidade` | R$ 89/mês | ilimitado (`NULL`) | 10 |
| `rede` | sob consulta (`NULL`) | ilimitado | ilimitado |

Em `price_cents`, `NULL` é "sob consulta" e `0` é gratuito de verdade. Toda
organização nasce em `avaliacao`.

## Pendências conhecidas

- **O limite do plano não é aplicado.** Nada impede o 101º membro no Semente nem
  o 11º usuário no Comunidade. Os tetos estão cadastrados, mas nenhuma rota os
  consulta. É decisão consciente do MVP, não esquecimento.
- **Não há recuperação de senha por e-mail**, porque não há envio de e-mail
  configurado. O socorro é um responsável redefinir a senha em
  `PATCH /api/users/[id]`.
- Essa redefinição **recusa** quem também acessa outra organização, porque a
  senha é da identidade global e não do vínculo — redefini-la daria acesso à
  outra igreja. Quem acessa duas igrejas e perde a senha fica sem saída.
- **Não há troca da própria senha**: ela precisa pedir a senha atual, e essa
  rota ainda não existe.
- **O convite não é enviado por e-mail**: `POST /api/users` devolve a
  `inviteUrl` para quem convidou repassar.

## Valores persistidos

| Banco | Interface |
| --- | --- |
| `active` / `inactive` | Ativo / Inativo |
| `baptized` / `waiting` | Batizado / Aguardando |
| `waiting_contact` | Aguardando Contato |
| `following_up` | Em Acompanhamento |
| `integrated` | Integrado |
| `visited` / `contacted` / `home_visit` / `baptism` / `member` | Etapas da jornada do visitante |
| `income` / `expense` | Entrada / Saída |
| `paid` / `pending` | Pago / Pendente |
