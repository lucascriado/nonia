# Nonia - Instrucoes para agentes

## Visao geral

- Nonia (nonia.io) e uma plataforma de gestao ministerial.
- Aplicacao Next.js 16 com App Router, React 19, TypeScript e CSS global.
- Backend em Route Handlers Node dentro de `app/api`.
- PostgreSQL acessado por Sequelize v6, com SQL explicito nas consultas.
- Reutilize componentes e tokens existentes antes de criar novos.
- Nao adicione Tailwind ou bibliotecas de UI sem necessidade clara.
- Mantenha textos e interfaces em portugues do Brasil.

## Validacao

Execute antes de finalizar alteracoes:

```bash
npm run typecheck
npm run build
git diff --check
```

## Arquitetura

- Paginas ficam em `app/<rota>/page.tsx`.
- APIs ficam em `app/api/<recurso>/route.ts`.
- Componentes compartilhados ficam em `components/`.
- Utilitarios e camada de dados ficam em `lib/`.
- Estilos globais e tokens ficam em `app/globals.css`.
- Use `DashboardShell` nas paginas administrativas.
- Use `AnimatedNumber` para indicadores carregados.
- Use os skeletons de `components/skeleton.tsx` durante consultas ao servidor.
- Nunca exiba `0` temporario enquanto um indicador ainda esta carregando.

## Backend e Sequelize

- A instancia compartilhada do Sequelize fica em `lib/db.ts`.
- Use os Models de `lib/models.ts` no CRUD.
- Use `db.transaction(callback)` para operacoes com multiplas escritas.
- Use `query<T>(sql, values)` somente em views, agregacoes e relatorios.
- Registre alteracoes relevantes com `addActivity` de `lib/activities.ts`.
- Continue usando parametros `$1`, `$2`, etc.; a camada usa `bind` do Sequelize.
- Nao crie uma nova conexao Sequelize dentro de rotas ou componentes.
- Nao use `sequelize.sync()`, `sync({ alter: true })` ou `sync({ force: true })`.
- Nao deixe logging SQL habilitado por padrao.
- Consultas agregadas, views e relatorios devem permanecer em SQL explicito
  quando isso for mais claro que Models e associacoes.
- Sequelize gerencia conexao, pool e transacoes. As migrations SQL continuam
  sendo a fonte de verdade do schema.

## Banco e migrations

- A variavel obrigatoria e `DATABASE_URL`; nunca versione credenciais reais.
- Migrations ficam em `database/migrations/` e devem ser executadas em ordem.
- Use `npm run db:migrate` (database/migrate.mjs); ele registra arquivos em
  `schema_migrations`. Em producao as migrations rodam no boot do container.
- Dados de demonstracao ficam em `database/seeds/dev_seed.sql` e so entram
  com `npm run db:seed:dev`; nunca coloque seeds em migrations.
- `people` concentra dados pessoais compartilhados.
- `members` e `visitors` referenciam `people` por `person_id`.
- `activities` alimenta a Dashboard e a tela de historico.
- `events` alimenta calendario e proximos eventos.
- As views `member_directory` e `visitor_directory` alimentam as listagens.
- Para mudar o schema, crie uma nova migration. Nao altere migrations aplicadas.
- Em desenvolvimento, prefira tunel SSH em vez de expor PostgreSQL a internet.

## Navegacao

- Adicione novas rotas de menu em `primaryLinks` de `components/sidebar.tsx`.
- O item ativo deve ser determinado pelo pathname.
- A sidebar deve permanecer recolhida ao navegar entre paginas.
- No mobile, a sidebar deve fechar ao clicar fora.

## Design e estilos

- Preserve os tokens em `:root`, especialmente cores, bordas e easing.
- Inputs, selects, textareas e botoes devem herdar a fonte Fustat.
- Selects devem usar a seta customizada com recuo de `16px`.
- Paineis usam borda `--border`, fundo branco e raio de `12px`.
- Titulos e acoes primarias usam `--heading`.
- Hovers e animacoes devem ser sutis e respeitar `prefers-reduced-motion`.
- Use Sonner para feedback de sucesso, erro e informacao.
- Em salvar, alterar e excluir, mostre spinner, texto de loading e bloqueie
  cliques duplicados ate a resposta do servidor.

## Responsividade

- Desktop: sidebar fixa e recolhivel.
- Tablet: componentes podem quebrar em multiplas linhas.
- Mobile: tabelas devem virar cartoes legiveis quando necessario.
- Evite layouts que dependam da largura dinamica do conteudo.
- Tabelas usam `table-layout: fixed`, `colgroup` e larguras explicitas.
- Textos longos em colunas fixas devem usar ellipsis.

## Listas, filtros e dados

- Dados exibidos devem vir das APIs e do PostgreSQL, nao de mocks.
- Filtros devem funcionar e recalcular a paginacao.
- Alterar filtros deve retornar para a primeira pagina.
- Inclua estado vazio quando nenhum registro for encontrado.
- Use chaves React unicas e estaveis.
- Paginacoes mostram no maximo tres numeros visiveis e mantem setas.

## Componentes compartilhados

- Reutilize estilos e componentes de filtros, paginacao, tags e acoes.
- Acoes padrao de registros: visualizar, editar e excluir.
- Mantenha `aria-label` descritivo em botoes apenas com icone.
- Formularios de membros e visitantes usam `PersonRecordDialog`.
- Normalize opcionais do banco para string vazia antes de alimentar inputs.
- Sem foto, exiba as duas primeiras iniciais da pessoa.
- CPF, telefone e CEP possuem mascara. CEP completo consulta ViaCEP e preenche
  logradouro, bairro, cidade e estado.

## Funcionalidades existentes

- Dashboard conectada ao banco com indicadores, calendario, atividades,
  proximos eventos e aniversariantes.
- Gestao de membros com busca, filtros, paginacao, celulas e CRUD.
- Gestao de visitantes com busca, filtros, abas, paginacao e CRUD.
- Historico de atividades com busca, periodo, categorias e paginacao.
- Financeiro (`/financeiro`) com saldo disponivel, entradas, saidas,
  pendencias, filtros (tipo, status, categoria, comprovante, busca),
  paginacao e CRUD de lancamentos com comprovante/anexo (PNG, JPG ou PDF).
- Sidebar responsiva, recolhivel e persistente entre navegacoes.
- Sonner para notificacoes e skeletons para carregamento remoto.

## Financeiro

- Tabela `financial_transactions`: `type` (`income`/`expense`), `category`
  (lista fixa por tipo, ver `lib/finance-records.ts`), `counterparty`
  (origem da entrada ou destino da saida), `amount`, `status`
  (`paid`/`pending`), `transaction_date`, `payment_method`, `attachment_url`/
  `attachment_name` e `notes`.
- Comprovantes seguem o mesmo padrao de `avatar_url`: base64 inline com
  CHECK de formato (`image/png`, `image/jpeg` ou `application/pdf`) e
  limite de tamanho (`ATTACHMENT_MAX_BYTES` em `lib/finance-records.ts`).
- Categorias sao uma lista fixa por tipo (nao ha tabela de categorias);
  para adicionar uma categoria, atualize `lib/finance-records.ts` e a
  CHECK constraint `financial_transactions_category_check` em uma nova
  migration.
- Toda escrita registra atividade com `addActivity(transaction, "financial", ...)`.

## Implementacao a partir do Figma

- Adapte o design ao stack e aos componentes existentes.
- Nao copie Tailwind gerado pelo Figma.
- Priorize consistencia com as paginas existentes.
- Implemente filtros, busca, abas e paginacao quando fizerem parte do fluxo.
- Valide responsividade alem da dimensao desktop apresentada no Figma.
