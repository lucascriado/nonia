# nonia — estado do projeto

Plataforma de gestão ministerial (membros, visitantes, células, ministérios,
agenda, financeiro) sendo transformada em **SaaS multi-igreja**.

Este arquivo descreve **o que existe hoje** e **o que foi decidido**. Convenções
de código estão em [`AGENTS.md`](AGENTS.md); como rodar o projeto, no
[`README.md`](README.md). Não duplique conteúdo entre os três.

> Última reconciliação com a realidade: **06/09/2026**. O conteúdo anterior a
> essa data descrevia um deploy que nunca existiu — se algo aqui divergir do
> que você observar, o observado ganha e este arquivo precisa ser corrigido.

## Estado real — 06/09/2026

| Item | Situação |
| --- | --- |
| Produção | **Não existe e está fora de escopo.** O nonia nunca foi deployado; desde 06/09/2026 ele roda **só localmente** — ver "Escopo atual" |
| Aplicação no Coolify | **Descartada.** Foi criada em 06/09/2026 e nunca publicada; a exclusão ficou a cargo do admin de VPS no mesmo dia — ver "Mudanças de escopo" |
| Base `postgres` do servidor | Provisionada e **vazia** (0 tabelas). Era a base destinada à produção; segue intocada. Baseline em `~/backups/nonia-2026-09-06.sql` |
| Domínio `nonia.app` | **Não responde, e ninguém vai consertar por ora.** Sem domínio no escopo atual — ver "Mudanças de escopo" |
| Autenticação na `main` | **Não existe.** Todas as rotas de `app/api` e todas as telas estão 100% abertas |
| Multi-tenancy na `main` | **Não existe.** Nenhuma tabela tem `organization_id` |
| Fase 1 (backend) | **Entregue na branch `feat/auth-multitenant`, ainda não integrada.** Ver "Em voo" abaixo |
| Banco de desenvolvimento | **É a única infra que o projeto usa hoje.** `nonia_dev`, no Postgres do Coolify (**18.6**), base separada da `postgres`, com o schema da Fase 1 aplicado (26 tabelas) e o seed rodado. Não há PostgreSQL nesta máquina — o acesso é pelo túnel SSH `nonia-db-tunnel.service`, que escuta só em `127.0.0.1:5432`. Detalhes com o admin de VPS, em `/home/lucas/claude.md` |

### Escopo atual: execução local (06/09/2026)

Decisão do Lucas: **o nonia roda localmente por enquanto.** Sem domínio, sem
DNS, sem deploy. A única infra que importa é **o banco estar online** — e ele
está, pelo túnel.

Isso não afrouxa a regra de integração: **a branch de auth não entra na `main`
antes das telas de login existirem.** O motivo mudou — não é mais "expõe dados
na internet", é "quebra o ambiente local do time inteiro, que fica sem
conseguir entrar" —, mas a ordem é a mesma.

> **O PostgreSQL embarcado na porta 54329 não é do nonia.** Ele pertence a
> outra sessão de agente nesta máquina e não faz parte do projeto — não aponte
> a `DATABASE_URL` para ele. O banco de desenvolvimento é o `nonia_dev` pelo
> túnel, em `127.0.0.1:5432`.

## Repositório e worktrees

`git@github.com:lucascriado/nonia.git` (público). Desenvolvimento em **Linux**,
em `/home/lucas/www/`.

| Worktree | Branch | Dono |
| --- | --- | --- |
| `/home/lucas/www/nonia` | `main` | gerente — árvore de **integração** |
| `/home/lucas/www/nonia-auth` | `feat/auth-multitenant` | backend/DBA |
| `/home/lucas/www/nonia-ui` | `feat/ui-theme` | frontend |

As branches dos devs existem **só localmente** — não estão em `origin`.

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
| **Sem `AUTH_SECRET`** | O token de sessão é aleatório e **opaco**; o banco guarda só o SHA-256 dele. Não é JWT, não há nada para assinar — **não reintroduza essa variável**. A variável nunca chegou a ser aplicada em lugar nenhum (verificado no banco do Coolify em 06/09/2026) | 06/09/2026 |
| **E-mail de usuário é único GLOBAL** | A identidade é `users`; o vínculo com cada igreja mora em `organization_members`. A mesma pessoa administra duas igrejas com um login só, e `POST /api/auth/switch` troca a organização ativa | 06/09/2026 |
| **Senha com scrypt do `node:crypto`** | `N=2^15, r=8, p=1`, `maxmem` 96 MB. Escolhido porque bcrypt e argon2 exigem **dependência nativa**, que quebraria o `output: "standalone"` do Dockerfile e traria compilação para o deploy. O hash guarda os próprios parâmetros, então dá para subir o custo depois sem invalidar senha antiga | 06/09/2026 |
| **Secretaria não lança financeiro** | O papel `secretaria` fica com `finance.read` e **sem** `finance.write`. Quem lança dízimo e oferta é `admin` ou `owner` | 06/09/2026 |
| **Planos comerciais definidos** | Semente, Comunidade e Rede — ver "Planos comerciais" abaixo | 06/09/2026 |
| **Pagamento: Mercado Pago** | Escolhido pelo requisito de CPF (Pix/boleto). O schema de planos/assinaturas é **agnóstico ao gateway**: colunas `provider*` guardam o id externo, nenhuma regra de domínio depende do MP | 06/09/2026 |
| **Route groups** | `app/(marketing)/` para o site público e `app/(app)/` para o sistema logado. Route group não entra na URL; a única rota que mudou foi a dashboard, de `/` para **`/painel`** | 06/09/2026 |
| **Tema sage/verde-floresta FICA** | Uma paleta índigo foi proposta e **reprovada pelo Lucas em 06/09/2026**. O commit da proposta já foi revertido na branch de UI. Não reabrir | 06/09/2026 |

### Rotas públicas decididas

`/` (landing), `/faq`, `/precos`, `/cadastro` e `/entrar` (login, em português,
coerente com o resto). Tudo o mais é `(app)` e exige sessão.

`/entrar` é fato consumado dos dois lados: `middleware.ts` da branch de auth já
usa `LOGIN = "/entrar"` e o frontend aponta para lá em
`components/marketing/routes.ts`.

## Em voo — pronto nas branches, ainda não integrado

Descrito aqui porque já é arquitetura de pé, não projeto. **Nada disso está na
`main`.**

### `feat/auth-multitenant` (backend/DBA) — Fase 1 entregue, 7 commits

Validação relatada pelo backend: `typecheck` e `build` limpos, **73 casos ponta
a ponta contra PostgreSQL 18.6 real, 0 falhas**.

- Migrations **004** (`organizations`, `users`, `roles`, `permissions`,
  `role_permissions`, `organization_members`, `sessions`, `invitations`,
  `plans`, `subscriptions`, `subscription_payments`, `billing_events`) e
  **005** (retrofit de `organization_id` nas 11 tabelas de domínio, com
  backfill e `NOT NULL` só no fim; idempotentes e transacionais).
- `lib/auth.ts` (sessão, `requireSession`/`requirePermission`/`requireRole`),
  `lib/passwords.ts`, `lib/tenant.ts` (escopo), `lib/http.ts`,
  `lib/invitations.ts`, `lib/organizations.ts`, `lib/cell-membership.ts`.
- `middleware.ts` no Edge: só desvia navegação pela presença do cookie
  `nonia_session`; quem valida de verdade é o handler.
- **12 endpoints** de autenticação e gestão de usuários, com escopo de tenant
  aplicado em **todas** as 26 rotas de `app/api`. O contrato está em
  [`AGENTS.md`](AGENTS.md#autenticação-e-multi-tenancy) — é lá que o frontend
  deve olhar.
- Papéis do sistema com nível: `owner` (100), `admin` (80), `secretaria` (60),
  `lider` (40), `leitura` (20). **24 permissões** no formato `recurso.acao`.
- Acesso de dev após `npm run db:seed:dev`: `demo@nonia.app` / `demo1234`.
  `npm run auth:owner` cria o proprietário de uma organização órfã.
- `docker-compose.yml` já alinhado em `postgres:18-alpine` nesta branch.

### `feat/ui-theme` (frontend) — 5 commits

- Route groups `(marketing)` e `(app)` separados, dashboard movida para
  `/painel`, título próprio por tela.
- Landing de venda em `/` e FAQ em `/faq`, com `marketing.css` e
  `components/marketing/`.
- Referências ao domínio antigo `nonia.io` corrigidas.
- A proposta de tema índigo foi revertida (reprovada).

## Isolamento entre organizações — estado medido

Medido nas migrations e nas rotas em 06/09/2026. Registrado porque a versão
otimista ("o banco recusa referência cruzada") **não é verdade em toda parte**.

**O banco barra sozinho** (FK composta que carrega `organization_id`):
`members.person_id`, `visitors.person_id`, `cell_members` (célula e membro),
`ministry_attendance_sessions.ministry_id` e `ministry_attendance_records`
(sessão e membro).

**O banco NÃO barra** (FK simples, sem `organization_id`):

| Coluna | Cobertura hoje |
| --- | --- |
| `cells.leader_id` | aplicação — `assertBelongsToOrganization` no POST e no PATCH |
| `ministries.leader_id` | aplicação — `assertBelongsToOrganization` no POST e no PATCH |
| `members.ministry_id` | aplicação — o ministério é resolvido **por nome dentro da organização** |
| `organization_members.person_id` | **descoberto** — gravado direto do payload em `POST /api/users` e `PATCH /api/users/[id]`, sem validação |

As três primeiras não são exploráveis: a camada de aplicação cobre. Falta o
backstop do banco, que vem na migration **006**. A quarta é uma lacuna real da
aplicação, não só do banco — ver Pendências.

## Planos comerciais

Oficiais desde 06/09/2026.

| Plano | Preço | Membros | Usuários |
| --- | --- | --- | --- |
| **Semente** | grátis | até 100 | 1 administrador |
| **Comunidade** | R$ 89/mês | ilimitados | até 10 |
| **Rede** | sob consulta | ilimitados, várias congregações | ilimitados |

O cadastro continua nascendo no plano **`avaliacao`**, 14 dias grátis.

O backend foi acionado em 06/09/2026 para cadastrar os três comerciais na
tabela `plans`, com os limites como dado do plano.

> **Nenhum desses limites é aplicado.** Ninguém bloqueia o 101º membro nem o
> 11º usuário: `plans.max_users` e `plans.max_people` existem no schema e são
> declarados em `lib/models.ts`, mas nenhuma rota os consulta. Os três planos
> comerciais também **não têm linha na tabela `plans`** — vivem só em
> `app/(marketing)/plans.ts`, no site. Vender com limite não verificado é
> aceitável no MVP **desde que ninguém ache que está pronto**.

## Lacunas conhecidas do MVP

Decididas, não esquecidas. Não "conserte" sem falar com o Lucas.

### Recuperação de senha — fora do MVP (06/09/2026)

Não existe fluxo de "esqueci minha senha", e é decisão, não pendência.
Recuperação por e-mail exige **e-mail transacional configurado** — SMTP e
domínio verificado —, que não existe hoje e não estava no escopo do MVP.

Enquanto isso, **quem perde a senha depende de um `owner` redefinir pela
gestão de usuários**. O backend foi orientado a não implementar nada até que
o Lucas reabra o assunto. O caminho `/recuperar-senha` aparece em
`GUEST_ONLY_PAGES` do middleware sem página correspondente — é resíduo, não
promessa.

## Mudanças de escopo e decisões revertidas

Nada aqui foi esquecido nem apagado: foi feito, estava certo para o contexto de
então, e o contexto mudou. Está escrito para que ninguém refaça achando que
faltou.

### Hospedagem, domínio e deploy — fora de escopo em 06/09/2026

Decisão do Lucas: rodar localmente por enquanto, sem domínio nem DNS, e excluir
a aplicação criada no Coolify. Só importa o banco estar online.

| O que existia | Situação |
| --- | --- |
| Aplicação `nonia` no Coolify, criada em 06/09/2026 com `fqdn` nulo e auto-deploy desligado | **Descartada.** Nunca foi publicada, nunca teve container. A exclusão ficou com o admin de VPS. O uuid dela é **histórico** — não recrie a aplicação |
| Plano de DNS/Cloudflare para `nonia.app` (7 etapas, Origin CA da zona antes da nuvem laranja) | **Arquivado**, não pendente. O levantamento continua correto e está em `/home/lucas/www/FASE0-INFRA.md` para quando o assunto voltar. O domínio segue quebrado de propósito |
| `www.nonia.app` | Nunca existiu registro, e não vai existir por ora |
| Env `APP_URL` | **Saiu da lista.** Só servia para montar link de convite com domínio público |
| "Não deployar enquanto as rotas estiverem abertas" | O raciocínio estava certo e virou **inaplicável**: não há para onde deployar. A regra que sobrevive é a de integração — ver "Escopo atual" |

O `Dockerfile`, o `docker-compose.yml` e o `HEALTHCHECK` em `/api/health`
continuam no repositório e funcionam localmente. Quando a hospedagem voltar ao
escopo, o caminho é Coolify com build pack `dockerfile` na porta 3000, e as
migrations rodam no boot do container — mas isso é plano, não estado.

## Infraestrutura — o que importa hoje

**Só o banco.** Não há aplicação hospedada, domínio nem deploy no escopo atual.
Cada dev roda o nonia na própria máquina (`npm run dev`) contra o `nonia_dev`,
alcançado pelo túnel SSH `nonia-db-tunnel.service` em `127.0.0.1:5432`.

Daí a pendência de infra número 1 ser o **`linger`**: sem ele, o túnel morre
quando o Lucas encerra a sessão e o time inteiro fica sem banco. Antes era um
incômodo; com tudo rodando local contra um banco remoto, é o ponto único de
falha do dia a dia.

O `Dockerfile` e o `docker-compose.yml` continuam no repositório e funcionam
para subir tudo localmente. O que saiu de cena foi a hospedagem — ver
"Mudanças de escopo".

**Identificadores e pendências de infra (uuids, hosts, senhas, faixas de
firewall, `linger` do túnel de desenvolvimento) vivem em um
lugar só: `/home/lucas/claude.md`, mantido pelo administrador de VPS.** Este arquivo não os
repete de propósito — uuid duplicado em dois documentos vira uuid errado em um
deles, que foi exatamente o que custou tempo em 06/09/2026.

### Banco

| Papel | Versão |
| --- | --- |
| Mínimo exigido pelas migrations | **PostgreSQL 13+** (`gen_random_uuid()` nativo, sem `pgcrypto`) |
| `nonia_dev` e a base `postgres` do mesmo servidor | **PostgreSQL 18.6** |

No servidor, usuário e base padrão são `postgres`, não `nonia`.

> O piso de 13+ pode subir para **15+** dependendo de como a migration 006
> fechar as FKs que faltam — ver Pendências.

### Variáveis de ambiente

| Variável | Papel |
| --- | --- |
| `DATABASE_URL` | **obrigatória**, única exigida hoje |
| `PORT` | opcional, padrão 3000 |
| `MIGRATE_CONNECT_ATTEMPTS` | opcional, tentativas de conexão do `migrate.mjs` (padrão 15) |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | Mercado Pago, ainda não referenciadas no código |

Todas são **runtime**. Nenhuma pode virar `NEXT_PUBLIC_*`. Nunca commite valores.

`APP_URL` saiu desta lista em 06/09/2026: ela só servia para montar o link de
convite com um domínio público, que não existe mais no escopo. Sem ela, vale o
host da requisição — que localmente é o que se quer.

## Pendências

Datadas para que ninguém as leia como fato consumado.

| Pendência | Desde |
| --- | --- |
| **`linger` do túnel de banco — pendência de infra nº 1.** Sem `loginctl enable-linger`, o `nonia-db-tunnel.service` cai quando o Lucas encerra a sessão e **o time inteiro fica sem banco**. Detalhes com o admin de VPS, em `/home/lucas/claude.md` | 06/09/2026 |
| **`organization_members.person_id` aceita uuid de outra organização.** `POST /api/users` e `PATCH /api/users/[id]` gravam o campo direto do payload, sem `assertBelongsToOrganization`. Nenhuma rota lida hoje devolve dado da pessoa por esse caminho (só o uuid), mas é escrita cruzada entre tenants e precisa de correção na aplicação, não só da 006 | 06/09/2026 |
| **Migration 006** — fechar as FKs que faltam (`cells.leader_id`, `ministries.leader_id`, `members.ministry_id`, `organization_members.person_id`). **Ordem decidida em 06/09/2026: a validação de aplicação vem primeiro, a migration no mesmo lote** — a 006 sozinha trocaria uma gravação errada silenciosa por um erro de FK cru na cara do usuário. Se o caminho escolhido exigir `ON DELETE SET NULL` por coluna, o **piso de PostgreSQL sobe de 13+ para 15+** e este arquivo precisa ser corrigido | 06/09/2026 |
| **`middleware.ts` será renomeado para `proxy.ts`** (o Next 16 depreciou "middleware" em favor de "proxy"). Decidido em 06/09/2026, **ainda não feito** — verificado: só existe `middleware.ts` na branch de auth | 06/09/2026 |
| **Limites de plano não são aplicados** e os planos comerciais não existem na tabela `plans`. Ver "Planos comerciais" | 06/09/2026 |
| `/precos` e `/cadastro` **não existem como página** — são só constantes em `components/marketing/routes.ts` na branch de UI. O frontend está montando as duas | 06/09/2026 |
| `docker-compose.yml` da **`main`** ainda sobe `postgres:17-alpine`; a branch de auth já corrigiu para `18-alpine` e o alinhamento chega pela integração | 06/09/2026 |
| `.env.example` da **`main`** ainda diz "Em produção (Dokploy)"; a branch de auth já corrige. Não foi tocado aqui para não criar conflito | 06/09/2026 |
| Nome falso "Pr. Renato" repetido em 3 arquivos (`app/configuracoes/page.tsx`, `components/header.tsx`, `components/sidebar.tsx`) — vira perfil do usuário logado na Fase 3 | 06/09/2026 |
