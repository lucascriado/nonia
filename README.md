# nonia

Plataforma de gestão ministerial: membros, visitantes, células, ministérios,
agenda, financeiro e histórico de atividades. Em transformação para SaaS
multi-igreja.

- **Stack**: Next.js 16 (App Router), React 19, TypeScript, Sequelize v6 e PostgreSQL.
- **Frontend**: CSS global com design tokens (sem Tailwind), fonte Inter, Lucide e Sonner.
- **Backend**: Route Handlers em `app/api`, banco versionado por migrations SQL.

> **O nonia roda localmente.** Não há ambiente hospedado, domínio nem deploy —
> decisão de 06/09/2026. Estado do projeto, decisões e pendências em
> [`CLAUDE.md`](CLAUDE.md).

## Desenvolvimento local

Pré-requisitos: Node 22+ e PostgreSQL **13 ou superior** (o banco do time roda 18.6).

```bash
cp .env.example .env        # ajuste a DATABASE_URL
npm install
npm run db:migrate          # cria o schema do zero
npm run db:seed:dev         # (opcional) dados de demonstração
npm run dev                 # http://localhost:3000
```

Também dá para subir app + banco com Docker Compose:

```bash
docker compose up --build
```

## Validação

Rode os dois antes de finalizar qualquer alteração:

```bash
npm run typecheck
npm run build
```

## Estrutura

```
app/            páginas (App Router) e APIs em app/api
components/     componentes compartilhados (shell, sidebar, diálogos, skeletons)
lib/            conexão (db.ts), models Sequelize, utilitários
database/       migrations SQL, seed de desenvolvimento e executor (migrate.mjs)
public/         arquivos estáticos
```

## Onde continuar

| Assunto | Arquivo |
| --- | --- |
| Estado real, decisões de arquitetura, worktrees, infraestrutura e pendências | [`CLAUDE.md`](CLAUDE.md) |
| Convenções de código, arquitetura e regras para agentes | [`AGENTS.md`](AGENTS.md) |
| Banco, migrations e valores persistidos | [`database/README.md`](database/README.md) |
