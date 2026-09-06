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

### `feat/auth-multitenant` (backend/DBA) — Fase 1 entregue, 8 commits

Validação relatada pelo backend: `typecheck` e `build` limpos, **97 casos
automatizados contra PostgreSQL 18.6 real, 0 falhas**.

- Migrations **004** (`organizations`, `users`, `roles`, `permissions`,
  `role_permissions`, `organization_members`, `sessions`, `invitations`,
  `plans`, `subscriptions`, `subscription_payments`, `billing_events`),
  **005** (retrofit de `organization_id` nas 11 tabelas de domínio, com
  backfill e `NOT NULL` só no fim), **006** (backstop de isolamento no banco)
  e **007** (planos comerciais). Todas idempotentes e transacionais.
- `lib/auth.ts` (sessão, `requireSession`/`requirePermission`/`requireRole`),
  `lib/passwords.ts`, `lib/tenant.ts` (escopo), `lib/http.ts`,
  `lib/invitations.ts`, `lib/organizations.ts`, `lib/cell-membership.ts`.
- `proxy.ts` no Edge (era `middleware.ts`): só desvia navegação pela presença
  do cookie `nonia_session`; quem valida de verdade é o handler.
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

## Isolamento entre organizações

Fechado nas duas camadas desde a migration **006** (06/09/2026).

1. **Aplicação** — toda rota de `app/api` começa por `requirePermission(...)` e
   usa `organizationId(auth)` em toda leitura e escrita. Id que chega pelo
   payload passa por `assertBelongsToOrganization` e volta **400 `cross_tenant`**
   com mensagem de negócio; id que vem na URL passa por `assertOwnedResource` e
   volta 404, para não confirmar que o id existe em outra organização.
2. **Banco** — não sobrou **nenhuma FK simples** entre tabelas de domínio. Toda
   referência é composta `(id, organization_id)`, e as sete constraints antigas
   que duplicavam uma composta foram removidas: uma constraint por referência, e
   é a que carrega o tenant.

Verificado pelo gerente no `nonia_dev`, em transação com `ROLLBACK` e um
savepoint por coluna: as quatro gravações cruzadas que antes passavam
(`members.ministry_id`, `cells.leader_id`, `ministries.leader_id`,
`organization_members.person_id`) são recusadas com **23503**.

As quatro são `ON DELETE SET NULL (<coluna>)`. A lista de colunas não é
enfeite: sem ela o `SET NULL` zeraria também `organization_id`, que é
`NOT NULL`, e excluir uma pessoa passaria a estourar. É essa forma que
**exige PostgreSQL 15+**.

A 006 também sana referências já gravadas cruzadas **antes** de criar as
constraints — uma base suja derrubaria o boot do container, já que as migrations
rodam na inicialização. Testado com base suja de propósito.

> **Como isso foi feito importa.** Até 06/09/2026 quatro colunas tinham FK
> simples e a aplicação cobria três delas; `organization_members.person_id` não
> era validado em lugar nenhum. A ordem escolhida foi **validação de aplicação
> primeiro, migration no mesmo lote** — a 006 sozinha teria trocado uma gravação
> cruzada silenciosa por um erro de FK cru na cara do usuário. Vale para a
> próxima vez que uma constraint nova for fechada sobre um caminho já aberto.

## Planos comerciais

Oficiais desde 06/09/2026.

| Plano | Preço | Membros | Usuários |
| --- | --- | --- | --- |
| **Semente** | grátis | até 100 | 1 administrador |
| **Comunidade** | R$ 89/mês | ilimitados | até 10 |
| **Rede** | sob consulta | ilimitados, várias congregações | ilimitados |

O cadastro continua nascendo no plano **`avaliacao`**, 14 dias grátis.

Os três estão cadastrados na tabela `plans` desde a migration **007**, com os
limites como **dado do plano**, não como regra espalhada pelo código — é neles
que o checkout do Mercado Pago vai se ancorar.

Em `price_cents`, **`NULL` é "sob consulta" e `0` é gratuito de verdade**. A
coluna virou anulável na 007 exatamente por isso: sem a distinção, a Rede
ficaria indistinguível da Semente no banco. `max_users` e `max_people` nulos
significam ilimitado.

> **Nenhum desses limites é aplicado.** Nada impede o 101º membro no Semente nem
> o 11º usuário no Comunidade: os tetos estão cadastrados e **nenhuma rota os
> consulta**. Vender com limite não verificado é aceitável no MVP **desde que
> ninguém ache que está pronto**.

## Lacunas conhecidas do MVP

Decididas, não esquecidas. Não "conserte" sem falar com o Lucas.

### Senha: o que entrou e o que continua de fora (06/09/2026)

**Trocar a própria senha ENTROU no escopo.** Decisão do Lucas: hoje ninguém
consegue trocar a própria senha, nem o dono do sistema, então quem desconfia que
a senha vazou não tem o que fazer. Não custa e-mail nenhum. A rota pede **senha
atual e senha nova**; o backend está implementando — *ainda não existe no
código quando isto foi escrito.*

> **Troca com senha atual e `self_password_reset` são coisas diferentes, e as
> duas continuam certas.** O `403 self_password_reset` do
> `PATCH /api/users/[id]` bloqueia **redefinição sem confirmação** da própria
> senha; a rota nova é **troca com confirmação**. Quem "unificar" as duas
> pensando que são a mesma coisa abre um buraco: passa a permitir redefinir a
> própria senha sem provar que sabe a atual.

Continuam como lacunas conhecidas:

**1. Não existe recuperação de senha por e-mail.** Exige e-mail transacional
configurado — SMTP e domínio verificado —, que não existe; com o domínio fora de
escopo, ficou mais caro ainda. O caminho `/recuperar-senha` aparece em
`GUEST_ONLY_PAGES` do `proxy.ts` sem página correspondente: é resíduo, não
promessa.

**2. Quem acessa duas igrejas e ESQUECE a senha continua sem saída.** A nuance
importa: quem ainda lembra da senha vai poder trocá-la pela rota nova. Quem
esqueceu, não — não há recuperação por e-mail, e o socorro pelo
`PATCH /api/users/[id]` recusa esse caso com **403
`user_in_multiple_organizations`**, porque a senha é da identidade, não do
vínculo, e um `owner` de uma igreja não pode mexer na credencial que dá acesso a
outra. É consequência conhecida, não bug, e a primeira coisa a reabrir se
aparecer um usuário multi-igreja de verdade.

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
| Mínimo exigido pelas migrations | **PostgreSQL 15+** |
| `nonia_dev` e a base `postgres` do mesmo servidor | **PostgreSQL 18.6** |

No servidor, usuário e base padrão são `postgres`, não `nonia`.

O piso era 13+, por causa do `gen_random_uuid()` nativo, e **subiu para 15+ na
migration 006** (06/09/2026), que usa `ON DELETE SET NULL` com lista de colunas.

A alternativa seria trigger, e foi descartada com razão: ela não substituiria só
a validação — teria de reimplementar o próprio `ON DELETE SET NULL`, virando
cerca de seis triggers em quatro tabelas refazendo o motor de integridade
referencial em PL/pgSQL, e ainda sem a validação retroativa que o
`ADD CONSTRAINT` faz de graça. A 006 confere a versão e falha com mensagem em
português em servidor anterior, em vez de estourar erro de sintaxe.

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
| **Limites de plano não são aplicados.** Os tetos estão cadastrados na tabela `plans` desde a 007 e **nenhuma rota os consulta** — nada impede o 101º membro no Semente nem o 11º usuário no Comunidade. Ver "Planos comerciais" | 06/09/2026 |
| `/precos` e `/cadastro` **não existem como página** — são só constantes em `components/marketing/routes.ts` na branch de UI. O frontend está montando as duas | 06/09/2026 |
| `docker-compose.yml` da **`main`** ainda sobe `postgres:17-alpine`; a branch de auth já corrigiu para `18-alpine` e o alinhamento chega pela integração | 06/09/2026 |
| `.env.example` da **`main`** ainda diz "Em produção (Dokploy)"; a branch de auth já corrige. Não foi tocado aqui para não criar conflito | 06/09/2026 |
| Nome falso "Pr. Renato" repetido em 3 arquivos (`app/configuracoes/page.tsx`, `components/header.tsx`, `components/sidebar.tsx`) — vira perfil do usuário logado na Fase 3 | 06/09/2026 |
