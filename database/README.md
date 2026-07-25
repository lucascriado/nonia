# Banco de dados PostgreSQL

As migrations desta pasta preparam o banco do Nonia do zero. Elas usam SQL
PostgreSQL (13+) e são a fonte de verdade do schema.

## Estrutura

- `migrations/001_initial_schema.sql`: tabelas, constraints, índices e triggers.
- `migrations/002_directory_views.sql`: views `member_directory` e `visitor_directory`.
- `migrations/003_financial_transactions.sql`: tabela `financial_transactions`
  e extensão da categoria `financial` em `activities`.
- `seeds/dev_seed.sql`: dados de demonstração (apenas para desenvolvimento).
- `migrate.mjs`: executor de migrations multiplataforma (Node).

## Executar

Defina `DATABASE_URL` e execute:

```bash
npm run db:migrate       # aplica migrations pendentes
npm run db:seed:dev      # migrations + seed de demonstração
```

O executor mantém a tabela `schema_migrations` e ignora arquivos já aplicados.
Em produção (Docker/Dokploy), as migrations rodam automaticamente na
inicialização do container — não é preciso rodar nada manualmente.

Para mudar o schema, crie uma nova migration numerada (`003_...sql`).
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
