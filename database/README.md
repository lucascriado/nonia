# Banco de dados PostgreSQL

As migrations desta pasta preparam o banco do nonia do zero e são a **fonte de
verdade do schema**. Convenções de código estão no [`AGENTS.md`](../AGENTS.md);
estado do projeto e pendências, no [`CLAUDE.md`](../CLAUDE.md).

**Requer PostgreSQL 15+.** O piso era 13, por causa do `gen_random_uuid()`
nativo, e subiu na `006`, que usa `ON DELETE SET NULL` com lista de colunas. A
própria `006` confere a versão e falha com mensagem clara em servidor anterior.
O banco do time roda 18.6.

## Estrutura

- `migrations/001_initial_schema.sql`: tabelas, constraints, índices e triggers.
- `migrations/002_directory_views.sql`: views `member_directory` e `visitor_directory`.
- `migrations/003_financial_transactions.sql`: tabela `financial_transactions`
  e extensão da categoria `financial` em `activities`.
- `migrations/004_auth_and_billing.sql`: organizações, usuários, sessões,
  papéis e permissões (RBAC), convites e o esqueleto de planos/assinaturas.
- `migrations/005_multitenancy.sql`: `organization_id` nas tabelas de domínio,
  com backfill dos dados existentes para uma organização padrão.
- `migrations/006_cross_tenant_foreign_keys.sql`: troca as FKs simples entre
  tabelas de domínio por FKs compostas com `organization_id`.
- `migrations/007_plans.sql`: os planos comerciais com preços e limites.
- `seeds/dev_seed.sql`: dados de demonstração (só para desenvolvimento). Cria a
  organização `demo`, com acesso `demo@nonia.app` / `demo1234`.
- `migrate.mjs`: executor de migrations multiplataforma (Node).

> As migrations 004–007 chegam à `main` com a integração da branch
> `feat/auth-multitenant`.

## Executar

Defina `DATABASE_URL` e execute:

```bash
npm run db:migrate       # aplica migrations pendentes
npm run db:seed:dev      # migrations + seed de demonstração
```

O executor mantém a tabela `schema_migrations` e ignora arquivos já aplicados.
Rodando pelo container, as migrations são aplicadas na inicialização — por isso
**toda migration precisa ser segura e idempotente sobre uma base com dados**:
nada de dropar tabela, coluna nova nasce anulável e só vira `NOT NULL` depois do
backfill.

`npm run auth:owner -- --email <e> --name <n> --password <s>` cria o
proprietário de uma organização que ficou sem usuário — o caso da organização
gerada pelo backfill da `005`.

Para mudar o schema, crie uma nova migration numerada (a próxima é `008_...sql`).
Não altere migrations já aplicadas.

## Multi-tenancy no schema

Cada igreja é uma linha em `organizations` e toda tabela de domínio tem
`organization_id NOT NULL`.

Desde a `006`, **toda referência entre tabelas de domínio é uma FK composta
`(id, organization_id)`** — não sobrou nenhuma FK simples entre elas, e as sete
constraints que duplicavam uma composta foram removidas. Um `UPDATE` por SQL
direto cruzando organizações é recusado pelo banco, não só pela aplicação.

As quatro referências opcionais (`members.ministry_id`, `cells.leader_id`,
`ministries.leader_id`, `organization_members.person_id`) usam
`ON DELETE SET NULL (<coluna>)`. A lista de colunas não é enfeite: sem ela o
`SET NULL` zeraria também `organization_id`, que é `NOT NULL`, e excluir uma
pessoa passaria a estourar. É essa forma que exige o PostgreSQL 15+.

A validação equivalente na camada de aplicação está no
[`AGENTS.md`](../AGENTS.md) — ela continua obrigatória: o banco é a última
barreira, não a primeira.

## Backend Node e Sequelize

As rotas em `app/api` usam Sequelize v6 sobre o driver `pg`. A instância
compartilhada e o pool ficam em `lib/db.ts`; os Models ficam em `lib/models.ts`.

Consultas agregadas e views continuam usando SQL explícito por clareza. Não use
`sequelize.sync()`: mudanças de schema devem ser feitas com uma nova migration
SQL em `database/migrations/`.

Em desenvolvimento local, mantenha o PostgreSQL fechado para a internet. Se o
banco estiver em um servidor remoto, use um túnel SSH:

```bash
ssh -N -L 15432:127.0.0.1:5432 usuario@servidor
```

Depois aponte `DATABASE_URL` para `127.0.0.1:15432`.

## Planos

Os limites são **dado**, em colunas de `plans`, e não regra espalhada pelo
código — é neles que o checkout do Mercado Pago vai se ancorar.

| slug | `price_cents` | `max_people` | `max_users` |
| --- | --- | --- | --- |
| `avaliacao` | 0, por 14 dias | 200 | 5 |
| `semente` | 0 | 100 | 1 |
| `comunidade` | 8900 | `NULL` (ilimitado) | 10 |
| `rede` | `NULL` (sob consulta) | `NULL` | `NULL` |

Em `price_cents`, **`NULL` é "sob consulta" e `0` é gratuito de verdade** — sem
essa distinção a Rede ficaria indistinguível da Semente. Toda organização nasce
em `avaliacao`.

**Os tetos não são aplicados por nenhuma rota.** Ver Pendências no
[`CLAUDE.md`](../CLAUDE.md).

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
