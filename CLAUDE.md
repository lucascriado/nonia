# nonia — estado do projeto

Plataforma de gestão ministerial (membros, visitantes, células, ministérios,
agenda, financeiro) sendo transformada em **SaaS multi-igreja**.

Este arquivo descreve **o que existe hoje** e **o que foi decidido**. Convenções
de código estão em [`AGENTS.md`](AGENTS.md); como rodar o projeto, no
[`README.md`](README.md). Não duplique conteúdo entre os três.

> Última reconciliação com a realidade: **06/09/2026**. O conteúdo anterior
> descrevia um deploy que nunca existiu — se algo aqui divergir do que você
> observar, o observado ganha e este arquivo precisa ser corrigido.

## Estado real — 06/09/2026

| Item | Situação |
| --- | --- |
| Produção | **Não existe.** O nonia nunca foi deployado, nunca teve container no ar |
| Aplicação no Coolify | Criada em 06/09/2026, `fqdn` nulo, auto-deploy **desligado**, nunca publicada |
| Banco de produção | Provisionado e **vazio** (0 tabelas). Baseline em `~/backups/nonia-2026-09-06.sql` |
| Domínio `nonia.app` | **Não responde.** Zona no Cloudflare, mas o registro A é nuvem cinza e o firewall só aceita faixas do Cloudflare → timeout |
| `www.nonia.app` | Não existe registro |
| Autenticação na `main` | **Não existe.** Todas as rotas de `app/api` e todas as telas estão 100% abertas |
| Multi-tenancy na `main` | **Não existe.** Nenhuma tabela tem `organization_id` |
| Postgres local de dev | Não instalado nesta máquina (trava no `sudo`); script pronto em `/home/lucas/www/setup-postgres-dev.sh` |

**Nenhum deploy até a Fase 1 estar integrada.** Publicar hoje expõe membros,
visitantes e financeiro a qualquer pessoa na internet. Some-se a isso que o
`CMD` do Dockerfile é `node database/migrate.mjs && node server.js`: um deploy
acidental roda as migrations sozinho contra o banco.

## Repositório e worktrees

`git@github.com:lucascriado/nonia.git` (público). Desenvolvimento em **Linux**,
em `/home/lucas/www/`.

| Worktree | Branch | Dono |
| --- | --- | --- |
| `/home/lucas/www/nonia` | `main` | gerente — árvore de **integração** |
| `/home/lucas/www/nonia-auth` | `feat/auth-multitenant` | backend/DBA |
| `/home/lucas/www/nonia-ui` | `feat/ui-theme` | frontend |

### Regras de processo

- **Ninguém dá push na `main`.** Cada dev trabalha no seu worktree e na sua
  branch; o gerente integra.
- Não mexa no worktree de outro dev — eles estão em movimento.
- `CLAUDE.md`, `AGENTS.md` e `README.md` são mantidos pelo documentador
  (decidido em 06/09/2026). Devs não editam esses arquivos nas branches;
  mandam o conteúdo técnico pelo gerente.
- Nada de deploy enquanto as rotas de `app/api` estiverem sem autenticação.

## Stack

Next.js 16 (App Router) + React 19 em TypeScript, Sequelize v6 sobre `pg`,
CSS global com design tokens (sem Tailwind), `lucide-react` nos ícones e
`sonner` nos toasts. Fonte **Inter** via `next/font/google`.

Estrutura da `main` hoje:

```
app/
  api/          route handlers (members, visitors, cells, ministries,
                events, financeiro, activities, dashboard, health)
  atividades/ calendario/ celulas/ configuracoes/ financeiro/
  membros/ ministerios/ visitantes/
  layout.tsx  page.tsx (dashboard)  globals.css  icon.svg
components/     shell, sidebar, header, diálogos, skeletons, calendário
lib/            db.ts, models.ts, activities.ts, records.ts,
                finance-records.ts, pagination.ts
database/       migrate.mjs, migrations/ (001–003), seeds/
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | desenvolvimento |
| `npm run build` | build de produção |
| `npm start` | serve o build |
| `npm run db:migrate` | aplica as migrations pendentes |
| `npm run db:seed:dev` | migrations + dados de demonstração |
| `npm run typecheck` | `tsc --noEmit` |

## Decisões de arquitetura registradas

Decisões fechadas. Reabrir só com o Lucas, não por conta própria.

| Decisão | Conteúdo | Data |
| --- | --- | --- |
| **SaaS multi-igreja** | Cada igreja é uma `organization` (tenant). `organization_id` em toda tabela de domínio, isolamento total entre organizações | 06/09/2026 |
| **Autenticação própria** | Sessão persistida em tabela + cookie httpOnly. **Sem Auth.js/NextAuth** | 06/09/2026 |
| **Sem `AUTH_SECRET`** | O token de sessão é aleatório e **opaco**; o banco guarda só o SHA-256 dele. Não é JWT, não há nada para assinar — **não reintroduza essa variável** | 06/09/2026 |
| **Pagamento: Mercado Pago** | Escolhido pelo requisito de CPF (Pix/boleto). O schema de planos/assinaturas é **agnóstico ao gateway**: colunas `provider*` guardam o id externo, nenhuma regra de domínio depende do MP | 06/09/2026 |
| **Route groups** | `app/(marketing)/` para o site público e `app/(app)/` para o sistema logado. Route group não entra na URL; a única rota que mudou foi a dashboard, de `/` para **`/painel`** | 06/09/2026 |
| **Tema sage/verde-floresta FICA** | Uma paleta índigo foi proposta e **reprovada pelo Lucas em 06/09/2026**. O commit da proposta já foi revertido na branch de UI. Não reabrir | 06/09/2026 |

### Rotas públicas decididas

`/` (landing), `/faq`, `/precos`, `/cadastro` e `/entrar` (login, em português,
coerente com o resto). Tudo o mais é `(app)` e exige sessão.

## Em voo — pronto nas branches, ainda não integrado

Descrito aqui porque já é arquitetura de pé, não projeto. **Nada disso está na
`main`.**

### `feat/auth-multitenant` (backend/DBA) — 5 commits

- Migrations **004** (`organizations`, `users`, `roles`, `permissions`,
  `role_permissions`, `organization_members`, `sessions`, `invitations`,
  `plans`, `subscriptions`, `subscription_payments`, `billing_events`) e
  **005** (retrofit de `organization_id` nas 11 tabelas de domínio, com
  backfill e `NOT NULL` só no fim; idempotentes e transacionais).
- `lib/auth.ts` (sessão, `requireSession`/`requirePermission`/`requireRole`),
  `lib/passwords.ts` (scrypt do `node:crypto`), `lib/tenant.ts` (escopo),
  `lib/http.ts`, `lib/invitations.ts`, `lib/organizations.ts`.
- `middleware.ts` no Edge: só desvia navegação pela presença do cookie
  `nonia_session`; quem valida de verdade é o handler.
- Rotas `POST /api/auth/login`, `/logout`, `/register`, `/invite`,
  `/invite/accept`, `/switch` e `GET /api/auth/session`. Login, cadastro e
  `session` devolvem o mesmo payload (`lib/auth-payloads.ts`).
- Escopo de tenant aplicado em **todas** as rotas de `app/api`.
- Papéis do sistema: `owner`, `admin`, `secretaria`, `lider`, `leitura`.
  Permissões são pares `recurso.acao`.
- Acesso de dev após `npm run db:seed:dev`: `demo@nonia.app` / `demo1234`.
  `npm run auth:owner` cria o proprietário de uma organização órfã.

### `feat/ui-theme` (frontend) — 5 commits

- Route groups `(marketing)` e `(app)` separados, dashboard movida para
  `/painel`, título próprio por tela.
- Landing de venda em `/` e FAQ em `/faq`, com `marketing.css` e
  `components/marketing/`.
- Referências ao domínio antigo `nonia.io` corrigidas.
- A proposta de tema índigo foi revertida (reprovada).

## Deploy e infraestrutura

O deploy é **Coolify**, build pack `dockerfile`, porta **3000**, e as
migrations rodam no boot do container. O healthcheck bate em `/api/health` com
`--start-period=30s`, então o Coolify espera o healthcheck passar antes de
trocar o container — ver o container antigo logo depois de um deploy é normal.

**Identificadores de infra (uuids, hosts, senhas, faixas de firewall, plano de
DNS) vivem em um lugar só: `/home/lucas/claude.md`.** Este arquivo não os
repete de propósito — uuid duplicado em dois documentos vira uuid errado em um
deles, que foi exatamente o que custou tempo em 06/09/2026.

### Banco

| Papel | Versão |
| --- | --- |
| Mínimo exigido pelas migrations | **PostgreSQL 13+** (`gen_random_uuid()` nativo, sem `pgcrypto`) |
| Produção | **PostgreSQL 18.6** |

Usuário e base em produção são `postgres`, não `nonia`.

### Variáveis de ambiente

| Variável | Papel |
| --- | --- |
| `DATABASE_URL` | **obrigatória**, única exigida hoje |
| `PORT` | opcional, padrão 3000 |
| `MIGRATE_CONNECT_ATTEMPTS` | opcional, tentativas de conexão do `migrate.mjs` (padrão 15) |
| `APP_URL` | opcional, só para montar o link de convite; sem ela vale o host da requisição *(chega com a Fase 1)* |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | Mercado Pago, ainda não referenciadas no código |

Todas são **runtime**. Nenhuma pode virar `NEXT_PUBLIC_*`. Nunca commite valores.

## Pendências

Datadas para que ninguém as leia como fato consumado.

| Pendência | Desde |
| --- | --- |
| `/precos`, `/cadastro` e `/entrar` **não existem como página** — são só constantes em `components/marketing/routes.ts` na branch de UI. O frontend está montando `/precos` e o esqueleto de `/cadastro` | 06/09/2026 |
| `middleware.ts` da branch de auth redireciona para `/login`, mas a rota decidida é **`/entrar`** — alinhar na integração. O mesmo vale para `/recuperar-senha`, que não tem decisão de produto nem página | 06/09/2026 |
| `docker-compose.yml` sobe `postgres:17-alpine`, produção roda 18.6 — alinhar em `18-alpine` | 06/09/2026 |
| Postgres local de desenvolvimento não instalado (precisa do `sudo` do Lucas) | 06/09/2026 |
| DNS de `nonia.app`: exige Origin CA da zona **antes** da nuvem laranja, senão troca timeout por 526. Plano em `/home/lucas/www/FASE0-INFRA.md`, aguarda ok do Lucas | 06/09/2026 |
| Nome falso "Pr. Renato" repetido em 3 arquivos (`app/configuracoes/page.tsx`, `components/header.tsx`, `components/sidebar.tsx`) — vira perfil do usuário logado na Fase 3 | 06/09/2026 |
| `next.config.ts` começa com um comentário `// teste commit` sem função | 06/09/2026 |
