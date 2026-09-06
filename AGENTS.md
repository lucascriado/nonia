# nonia — instruções para agentes

Convenções de código deste repositório. **Estado do projeto, decisões e
pendências ficam em [`CLAUDE.md`](CLAUDE.md)** — leia lá antes de assumir que
algo está no ar. Como rodar o projeto: [`README.md`](README.md).

## Visão geral

- Next.js 16 com App Router, React 19, TypeScript e CSS global.
- Backend em Route Handlers Node dentro de `app/api`.
- PostgreSQL acessado por Sequelize v6, com SQL explícito onde ajuda.
- Reutilize componentes e tokens existentes antes de criar novos.
- Não adicione Tailwind ou bibliotecas de UI sem necessidade clara.
- Mantenha textos e interfaces em português do Brasil.
- Não trabalhe no worktree de outro dev; não dê push na `main`.

## Validação

Execute antes de finalizar alterações:

```bash
npm run typecheck
npm run build
git diff --check
```

Ao escrever em arquivo que já existe, **leia antes e edite o trecho**; não jogue
um `cat >` por cima. Sobrescrever às cegas apaga o que outra pessoa acabou de
pôr ali, e o `git status` só avisa depois. Se acontecer, `git checkout -- <arquivo>`
antes de commitar.

## Mensagens de commit

- **Não inclua o rodapé `Claude-Session: https://claude.ai/code/session_…`.**
  Decisão de 06/09/2026: o GitGuardian acusou o repositório por causa dele. O
  identificador da sessão tem cara de token de alta entropia, e o scanner varre
  **mensagem de commit**, não só o diff — no commit apontado (`69cff07`) o diff
  estava limpo e a única string de alta entropia era essa linha.
- `Co-Authored-By:` continua normalmente.
- Os 36 commits que já têm o rodapé **ficam**. Não reescrevemos histórico
  público para limpar isso.
- O repositório é público: mensagem de commit é conteúdo publicado igual ao
  código. Nada de senha, token, uuid de infra ou IP nela.

## Arquitetura

- O App Router usa dois route groups, que **não** aparecem na URL:
  `app/(marketing)/` para o site público e `app/(app)/` para o sistema logado.
- A landing é `app/(marketing)/page.tsx` e responde em `/`; a dashboard é
  `app/(app)/painel/page.tsx` e responde em `/painel`. As demais telas
  (`/membros`, `/financeiro`, …) mantêm seus endereços.
- Todo CTA do site público sai de `components/marketing/routes.ts`. Ligar
  cadastro e checkout depois é trocar as constantes desse arquivo.
- APIs ficam em `app/api/<recurso>/route.ts`.
- Componentes compartilhados ficam em `components/`.
- Utilitários e camada de dados ficam em `lib/`.
- Estilos globais e tokens ficam em `app/globals.css`; os do site público em
  `app/(marketing)/marketing.css`, com prefixo `mk-` e cor sempre por token.
- Use `DashboardShell` nas páginas administrativas.
- Use `AnimatedNumber` para indicadores carregados.
- Use os skeletons de `components/skeleton.tsx` durante consultas ao servidor.
- Nunca exiba `0` temporário enquanto um indicador ainda está carregando.

> Os route groups e o site público chegam à `main` com a integração da branch
> `feat/ui-theme`. Código novo já deve seguir esta organização.

## Autenticação e multi-tenancy

Chega à `main` com a integração de `feat/auth-multitenant`. **Toda rota nova de
`app/api` já deve nascer autenticada e com escopo de tenant.**

### Modelo

- Cada igreja é uma `organization`; todo dado de domínio tem `organization_id`.
- A identidade de login é `users` (e-mail único **global**); o vínculo com a
  igreja e o papel ficam em `organization_members`. A mesma pessoa administra
  duas igrejas com um login só.
- Sessão própria: token aleatório **opaco** no cookie httpOnly `nonia_session`,
  com apenas o SHA-256 dele em `sessions`. **Não há JWT nem `AUTH_SECRET`** —
  não existe nada a assinar, não reintroduza essa variável.
- Senha com scrypt de `node:crypto` (`lib/passwords.ts`): `N=2^15, r=8, p=1`,
  `maxmem` 96 MB, sem dependência nativa. O hash guarda os próprios parâmetros
  de custo, então dá para encarecer depois sem invalidar senha antiga.
- Papéis do sistema: `owner` (100), `admin` (80), `secretaria` (60),
  `lider` (40), `leitura` (20). São 24 permissões no formato `recurso.acao`,
  em `permissions`/`role_permissions`.
- `secretaria` tem `finance.read` e **não** tem `finance.write`: lançamento
  financeiro é de `admin` ou `owner`. Decisão de produto, não descuido do seed.

### Contrato

Cookie `nonia_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` de
**30 dias**, `Secure` só quando `NODE_ENV=production`.

Erro, sempre: `{"error": "mensagem em pt-BR", "code": "slug"}`. Monte pelos
helpers de `lib/http.ts` — o `code` é o que o frontend usa, a mensagem é o que
o usuário lê.

`SessionPayload` (`lib/auth-payloads.ts`) é **idêntico** em cadastro, login,
aceite de convite, troca de organização e `GET /api/auth/session`:
`authenticated`, `user`, `organization`, `role`, `permissions` (ordenadas) e
`expiresAt`.

| Método e rota | O que faz |
| --- | --- |
| `POST /api/auth/register` | cadastra igreja + proprietário, abre sessão |
| `POST /api/auth/login` | autentica e abre sessão |
| `POST /api/auth/logout` | revoga a sessão e limpa o cookie |
| `POST /api/auth/password` | **troca da própria senha**, com `currentPassword` e `newPassword` |
| `GET /api/auth/session` | devolve a sessão corrente |
| `POST /api/auth/switch` | troca a organização ativa (`organizationId` ou `organizationSlug`) |
| `GET /api/auth/invite` | lê um convite pelo token |
| `POST /api/auth/invite/accept` | aceita o convite e abre sessão |
| `GET /api/users` | usuários da organização + convites pendentes |
| `POST /api/users` | adiciona usuário (com senha) ou gera convite (sem senha) |
| `PATCH /api/users/[id]` | papel, status, vínculo com pessoa e **redefinição de senha** |
| `DELETE /api/users/[id]` | remove o vínculo com a organização |
| `GET /api/roles` | papéis disponíveis |

**Trocar a própria senha e redefinir a de outra pessoa são rotas diferentes, de
propósito. Não unifique.**

| | `POST /api/auth/password` | `PATCH /api/users/[id]` |
| --- | --- | --- |
| quem usa | o dono da conta | um responsável (`users.write`) |
| prova a senha atual | **sim** | não — é socorro |
| vale para si mesmo | sim | não (`self_password_reset`) |
| vale em multi-organização | sim | não (`user_in_multiple_organizations`) |

O que separa as duas é a senha atual. Sem ela, a troca viraria "quem pegou uma
sessão aberta troca a senha e toma a conta".

`POST /api/auth/password` tem a mesma trava do login (5 tentativas, 15 minutos),
revoga **todas** as sessões e emite uma nova no mesmo response — o cookie repõe
a sessão, ninguém é deslogado. Erros próprios: `400` sem senha atual ou nova,
`400 weak_password`, `401 invalid_credentials` (mesmo código do login, para não
revelar nada a mais) e `429 too_many_attempts`.

Redefinir senha por `PATCH /api/users/[id]` também **revoga todas as sessões**
daquele usuário. Códigos de erro dessa rota e de `POST /api/users`:

| Código | Situação |
| --- | --- |
| `400 weak_password` | senha abaixo do mínimo |
| `400 cross_tenant` | id do payload é de outra organização |
| `403 self_password_reset` | tentativa de **redefinir** a própria senha por aqui. Não confundir com **trocar** a própria senha, que é outra rota e pede a senha atual — as duas coexistem de propósito |
| `403 insufficient_role_level` | papel do autor não alcança o papel do alvo |
| `403 user_in_multiple_organizations` | o alvo acessa mais de uma igreja; a senha é da identidade, não do vínculo |

Fora a inclusão de `POST /api/auth/password`, nenhuma rota de `app/api/auth`
mudou payload, resposta ou cookie.

### Regras ao escrever rota

- Comece com `requirePermission(...)` e use `organizationId(auth)` em todo
  SELECT, UPDATE, DELETE e INSERT.
- **Todo id que vem do payload precisa ser validado** com
  `assertBelongsToOrganization` / `filterOwnedMemberIds` de `lib/tenant.ts`,
  ou resolvido por nome dentro da organização. Id que vem na URL passa por
  `assertOwnedResource`, que devolve 404 em vez de confirmar que o id existe em
  outra organização.
- Desde a migration 006 o banco também recusa referência cruzada (FK composta em
  toda tabela de domínio), **mas isso não dispensa a validação**: sem ela o
  usuário recebe um erro de FK cru em vez de `400 cross_tenant` com mensagem de
  negócio. Aplicação é a primeira barreira, banco é a última.
- `proxy.ts` roda no Edge e só desvia navegação pela presença do cookie.
  Quem valida sessão e permissão é o handler, via `lib/auth.ts`.
- `addActivity` recebe o contexto da sessão e grava o tenant e o autor.
- Acesso de desenvolvimento após `npm run db:seed:dev`:
  `demo@nonia.app` / `demo1234`.
- `npm run auth:owner -- --email … --name … --password …` cria o proprietário
  de uma organização que ficou sem usuário.

## Armadilhas conhecidas

- **Renomear `middleware.ts` para `proxy.ts` não basta: a função exportada
  também precisa se chamar `proxy`.** Só o arquivo renomeado faz o Next
  responder **500 em toda requisição**, com o log dizendo
  `The file "./proxy.ts" must export a function`. Quem fizer o rename lendo só o
  aviso de depreciação derruba a aplicação inteira.
- **`next build` sem `DATABASE_URL` falha** com "Failed to collect page data",
  porque `lib/db.ts` instancia o Sequelize no import do módulo. Por isso o
  `Dockerfile` injeta uma `DATABASE_URL` fictícia só na etapa de build —
  **aquela linha não é sobra; quem "limpar" quebra o build.**

### Quando o culpado não é o seu código

Três sintomas diferentes, o mesmo gênero: algo fora do que você escreveu — um
arquivo gerado, uma instância em cache — se comporta como se o seu código
estivesse quebrado. Antes de caçar o bug, descarte estes.

- **`typecheck` falhando em `.next/dev/types/validator.ts`**, com
  `Cannot find module '../../../app/membros/page.js'` e mais oito iguais. O
  `tsconfig` inclui `.next/dev/types/**/*.ts`, então o `tsc` valida um arquivo
  **gerado** que ainda aponta para o caminho antigo — `app/membros/page.tsx`,
  que depois da integração é `app/(app)/membros/page.tsx`. Não é erro do seu
  código: é um `.next` de antes dos route groups. **Conserto: `rm -rf .next`.**
- **`next-env.d.ts` aparecendo sujo no `git status` sem você ter tocado nele.**
  O Next regrava o arquivo, e ele alterna entre `./.next/types/routes.d.ts` e
  `./.next/dev/types/routes.d.ts` conforme o último comando ter sido `build` ou
  `dev`. **Deixe como está e simplesmente não commite.** Não ponha no
  `.gitignore`: o arquivo sumiria do repositório e o Next reclamaria no primeiro
  build limpo.
- **`DataTypes.NOW` virando `Invalid date` e quebrando o INSERT do cadastro.**
  Acontece quando `lib/models.ts` é reavaliado sobre a instância do Sequelize
  cacheada em `globalThis`, no hot reload do `next dev`. Não aparece no primeiro
  boot, só depois de um reload. **Não use `DataTypes.NOW` neste projeto**; use
  default explícito: `() => new Date()` (ou
  `() => new Date().toISOString().slice(0, 10)` em `DATEONLY`).

## Backend e Sequelize

- A instância compartilhada do Sequelize fica em `lib/db.ts`.
- Use os Models de `lib/models.ts` no CRUD.
- Use `db.transaction(callback)` para operações com múltiplas escritas.
- Use `query<T>(sql, values)` somente em views, agregações e relatórios.
- Registre alterações relevantes com `addActivity` de `lib/activities.ts`.
- Continue usando parâmetros `$1`, `$2`, etc.; a camada usa `bind` do Sequelize.
- Não crie uma nova conexão Sequelize dentro de rotas ou componentes.
- Não use `sequelize.sync()`, `sync({ alter: true })` ou `sync({ force: true })`.
- Não deixe logging SQL habilitado por padrão.
- Consultas agregadas, views e relatórios permanecem em SQL explícito quando
  isso for mais claro que Models e associações.
- Sequelize gerencia conexão, pool e transações. As migrations SQL continuam
  sendo a fonte de verdade do schema.

## Autenticacao e multi-tenancy

- Cada igreja e uma `organization`; todo dado de dominio tem `organization_id`.
- A identidade de login e `users` (e-mail unico global); o vinculo com a
  igreja e o papel ficam em `organization_members`.
- Sessao propria: token aleatorio opaco no cookie httpOnly `nonia_session`,
  com o SHA-256 dele em `sessions`. Nao ha JWT nem AUTH_SECRET.
- Senha com scrypt de `node:crypto` (`lib/passwords.ts`), sem dependencia
  nativa. O hash guarda os proprios parametros de custo.
- `middleware.ts` roda no Edge e so desvia navegacao pela presenca do cookie.
  Quem valida sessao e permissao e o handler, via `lib/auth.ts`.
- Toda rota de `app/api` comeca com `requirePermission(...)` e usa
  `organizationId(auth)` em todo SELECT, UPDATE, DELETE e INSERT.
- Ids vindos do payload (`leaderId`, `memberIds`) passam por
  `assertBelongsToOrganization`/`filterOwnedMemberIds` de `lib/tenant.ts`.
- Papeis do sistema: `owner`, `admin`, `secretaria`, `lider`, `leitura`.
  As permissoes sao pares `recurso.acao` em `permissions`/`role_permissions`.
- `addActivity` agora recebe o contexto da sessao e grava o tenant e o autor.
- Acesso de desenvolvimento apos `npm run db:seed:dev`:
  `demo@nonia.app` / `demo1234`.
- `npm run auth:owner -- --email ... --name ... --password ...` cria o
  proprietario de uma organizacao que ficou sem usuario.

## Banco e migrations

- A variável obrigatória é `DATABASE_URL`; nunca versione credenciais reais.
- Piso de versão: **PostgreSQL 13+** (`gen_random_uuid()` nativo).
- Migrations ficam em `database/migrations/` e são executadas em ordem.
- Use `npm run db:migrate` (`database/migrate.mjs`); ele registra os arquivos
  em `schema_migrations`. No container, as migrations rodam no boot.
- Migration nova precisa ser **idempotente e transacional**: coluna nasce
  anulável, é preenchida e só então vira `NOT NULL`; nada é removido.
- Dados de demonstração ficam em `database/seeds/dev_seed.sql` e só entram com
  `npm run db:seed:dev`; nunca coloque seeds em migrations.
- `people` concentra dados pessoais compartilhados.
- `members` e `visitors` referenciam `people` por `person_id`.
- `activities` alimenta a Dashboard e a tela de histórico.
- `events` alimenta calendário e próximos eventos.
- As views `member_directory` e `visitor_directory` alimentam as listagens.
- Para mudar o schema, crie uma nova migration. Não altere migrations aplicadas.
- Em desenvolvimento, prefira túnel SSH em vez de expor PostgreSQL à internet.

## Navegação

- Adicione novas rotas de menu em `primaryLinks` de `components/sidebar.tsx`.
- Tela nova do sistema também entra em `APP_PAGES` do `proxy.ts`, senão ela é
  tratada como página pública.
- O item ativo deve ser determinado pelo pathname.
- A sidebar deve permanecer recolhida ao navegar entre páginas.
- No mobile, a sidebar deve fechar ao clicar fora.

## Design e estilos

- **O sistema visual é sage/verde-floresta e não está em discussão** (a paleta
  índigo foi proposta e reprovada em 06/09/2026).
- Preserve os tokens em `:root`, especialmente cores, bordas e easing.
- Toda cor vive em token — o tema escuro é só uma troca de variáveis.
- A fonte é **Inter**, via `next/font/google` e a variável `--font-sans`.
  Inputs, selects, textareas e botões devem herdá-la.
- Selects devem usar a seta customizada com recuo de `16px`.
- Painéis usam borda `--border`, fundo `--panel` e raio de `12px`.
- Títulos e ações primárias usam `--heading`.
- Hovers e animações devem ser sutis e respeitar `prefers-reduced-motion`.
- Use Sonner para feedback de sucesso, erro e informação.
- Em salvar, alterar e excluir, mostre spinner, texto de loading e bloqueie
  cliques duplicados até a resposta do servidor.

## Responsividade

- Desktop: sidebar fixa e recolhível.
- Tablet: componentes podem quebrar em múltiplas linhas.
- Mobile: tabelas devem virar cartões legíveis quando necessário.
- Evite layouts que dependam da largura dinâmica do conteúdo.
- Tabelas usam `table-layout: fixed`, `colgroup` e larguras explícitas.
- Textos longos em colunas fixas devem usar ellipsis.

## Listas, filtros e dados

- Dados exibidos devem vir das APIs e do PostgreSQL, não de mocks.
- Filtros devem funcionar e recalcular a paginação.
- Alterar filtros deve retornar para a primeira página.
- Inclua estado vazio quando nenhum registro for encontrado.
- Use chaves React únicas e estáveis.
- Paginações mostram no máximo três números visíveis e mantêm as setas.

## Componentes compartilhados

- Reutilize estilos e componentes de filtros, paginação, tags e ações.
- Ações padrão de registros: visualizar, editar e excluir.
- Mantenha `aria-label` descritivo em botões apenas com ícone.
- Formulários de membros e visitantes usam `PersonRecordDialog`.
- Normalize opcionais do banco para string vazia antes de alimentar inputs.
- Sem foto, exiba as duas primeiras iniciais da pessoa.
- CPF, telefone e CEP possuem máscara. CEP completo consulta o ViaCEP e
  preenche logradouro, bairro, cidade e estado.

## Módulos já construídos (reutilize antes de recriar)

- Dashboard ligada ao banco: indicadores, calendário, atividades, próximos
  eventos e aniversariantes.
- Membros, visitantes, células e ministérios com busca, filtros, paginação e
  CRUD. Ministérios têm sessões e registros de presença.
- Histórico de atividades com busca, período, categorias e paginação.
- Financeiro (`/financeiro`) com saldo, entradas, saídas, pendências, filtros
  (tipo, status, categoria, comprovante, busca), paginação e CRUD com anexo.

### Financeiro

- Tabela `financial_transactions`: `type` (`income`/`expense`), `category`
  (lista fixa por tipo, ver `lib/finance-records.ts`), `counterparty`,
  `amount`, `status` (`paid`/`pending`), `transaction_date`, `payment_method`,
  `attachment_url`/`attachment_name` e `notes`.
- Comprovantes seguem o padrão de `avatar_url`: base64 inline com CHECK de
  formato (`image/png`, `image/jpeg`, `application/pdf`) e limite de tamanho
  (`ATTACHMENT_MAX_BYTES` em `lib/finance-records.ts`).
- Categorias são lista fixa por tipo (não há tabela de categorias). Para
  adicionar uma, atualize `lib/finance-records.ts` **e** a CHECK constraint
  `financial_transactions_category_check` em uma nova migration.
- Toda escrita registra atividade com `addActivity(transaction, "financial", …)`.

## Implementação a partir do Figma

- Adapte o design ao stack e aos componentes existentes.
- Não copie Tailwind gerado pelo Figma.
- Priorize consistência com as páginas existentes.
- Implemente filtros, busca, abas e paginação quando fizerem parte do fluxo.
- Valide responsividade além da dimensão desktop apresentada no Figma.
