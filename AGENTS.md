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

- Cada igreja é uma `organization`; todo dado de domínio tem `organization_id`.
- A identidade de login é `users` (e-mail único global); o vínculo com a igreja
  e o papel ficam em `organization_members`.
- Sessão própria: token aleatório **opaco** no cookie httpOnly `nonia_session`,
  com apenas o SHA-256 dele em `sessions`. **Não há JWT nem `AUTH_SECRET`** —
  não existe nada a assinar, não reintroduza essa variável.
- Senha com scrypt de `node:crypto` (`lib/passwords.ts`), sem dependência
  nativa. O hash guarda os próprios parâmetros de custo.
- `middleware.ts` roda no Edge e só desvia navegação pela presença do cookie.
  Quem valida sessão e permissão é o handler, via `lib/auth.ts`.
- Toda rota de `app/api` começa com `requirePermission(...)` e usa
  `organizationId(auth)` em todo SELECT, UPDATE, DELETE e INSERT.
- Ids vindos do payload (`leaderId`, `memberIds`) passam por
  `assertBelongsToOrganization` / `filterOwnedMemberIds` de `lib/tenant.ts`.
- Papéis do sistema: `owner`, `admin`, `secretaria`, `lider`, `leitura`.
  As permissões são pares `recurso.acao` em `permissions`/`role_permissions`.
- `addActivity` recebe o contexto da sessão e grava o tenant e o autor.
- Erros de API saem por `lib/http.ts` (`unauthorized`, `forbidden`,
  `notFound`, `badRequest`, `conflict`), com `code` estável para o frontend.
- Acesso de desenvolvimento após `npm run db:seed:dev`:
  `demo@nonia.app` / `demo1234`.
- `npm run auth:owner -- --email … --name … --password …` cria o proprietário
  de uma organização que ficou sem usuário.

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
- Tela nova do sistema também entra em `APP_PAGES` do `middleware.ts`, senão
  ela é tratada como página pública.
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
