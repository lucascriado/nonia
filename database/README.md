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
- `migrations/008_plan_limits.sql`: renomeia `plans.max_people` para
  `plans.max_members` e prepara a aplicação dos tetos.
- `seeds/dev_seed.sql`: dados de demonstração (só para desenvolvimento). Cria a
  organização `demo`, com acesso `demo@nonia.app` / `demo1234`.
- `migrate.mjs`: executor de migrations multiplataforma (Node).

> As migrations 004–008 chegam à `main` com a integração da branch
> `feat/auth-multitenant`.

## Executar

Defina `DATABASE_URL` e execute:

```bash
npm run db:status        # o que falta aplicar, sem aplicar nada
npm run db:migrate       # aplica migrations pendentes
npm run db:seed:dev      # migrations + seed de demonstração
```

**`npm run db:status` antes de anunciar que uma integração está verificada.**
`typecheck` e `build` não tocam o banco: eles passam com o schema desatualizado,
e o problema só aparece depois, como 500 dizendo que uma coluna não existe —
uma mensagem que parece bug de código e não é. Já aconteceu uma vez, com a
`008`: a coluna `max_members` ainda era `max_people` no banco compartilhado
enquanto o código da `main` já a consultava. `db:status` sai com código 1
quando há pendência, então serve como verificação automática.

O executor mantém a tabela `schema_migrations` e ignora arquivos já aplicados.
Rodando pelo container, as migrations são aplicadas na inicialização — por isso
**toda migration precisa ser segura e idempotente sobre uma base com dados**:
nada de dropar tabela, coluna nova nasce anulável e só vira `NOT NULL` depois do
backfill.

`npm run auth:owner -- --email <e> --name <n> --password <s>` cria o
proprietário de uma organização que ficou sem usuário — o caso da organização
gerada pelo backfill da `005`.

Para mudar o schema, crie uma nova migration numerada (a próxima é `009_...sql`).
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

Em desenvolvimento, use **Postgres na sua própria máquina** e mantenha-o fechado
para a internet. Este repositório é auto-suficiente: as migrations criam o schema
do zero e o seed cria a organização de demonstração — ver o README na raiz.

> Havia aqui um exemplo de túnel SSH encaminhando para `127.0.0.1:5432` no
> servidor. **Foi removido em 06/09/2026 porque não funciona contra a nossa
> VPS** e o sintoma engana: o Postgres não tem porta publicada no host, só é
> alcançável dentro da rede docker, então o túnel sobe, aparenta estar de pé e
> devolve *connection refused* — o que faz a pessoa investigar firewall.

## Planos

Os limites são **dado**, em colunas de `plans`, e não regra espalhada pelo
código — é neles que o checkout do Mercado Pago vai se ancorar.

| slug | `price_cents` | `max_members` | `max_users` |
| --- | --- | --- | --- |
| `avaliacao` | 0, por 14 dias | 200 | 5 |
| `semente` | 0 | 100 | 1 |
| `comunidade` | 8900 | `NULL` (ilimitado) | 10 |
| `rede` | `NULL` (sob consulta) | `NULL` | `NULL` |

Em `price_cents`, **`NULL` é "sob consulta" e `0` é gratuito de verdade** — sem
essa distinção a Rede ficaria indistinguível da Semente. Toda organização nasce
em `avaliacao`.

A coluna se chamava `max_people` e virou `max_members` na `008`: a landing
promete "até 100 **membros**", e `people` aqui guarda membros **e** visitantes.
Contar visitante contra esse teto quebraria a promessa comercial.

### Plano efetivo

O plano de uma organização é **derivado**, não é simplesmente a linha em
`subscriptions`. `resolveEffectivePlan` em `lib/plan-limits.ts` é a única
fonte da regra, nesta ordem:

1. assinatura paga vigente (`active` ou `past_due`) → o plano dela;
2. senão, avaliação ainda dentro do prazo → o plano da avaliação;
3. senão → `semente`, gratuito e sem prazo.

Quem se cadastra entra em `avaliacao` por 14 dias e, terminado o prazo sem
assinar, cai para `semente`. É o que faz a landing ("gratuito para até 100
membros, sem prazo para expirar") e o cadastro serem verdade ao mesmo tempo.

O cálculo acontece **na leitura**, e isso é deliberado: não há cron nem
processo de fundo, e a máquina pode estar desligada na hora em que um prazo
virar. Derivando na leitura, o rebaixamento acontece sozinho e é impossível uma
organização ficar num estado que ninguém atualizou. Uma avaliação vencida
continua com `status = 'trialing'` no banco — a linha é o **contrato**
(o que foi assinado, quando vence, o id no gateway); o plano efetivo é o que
vale **agora**, e só esta função precisa saber a diferença.

`status = 'incomplete'` é cobrança ainda não confirmada e **não** libera o
plano pago: cai para a avaliação ou para o gratuito.

### Estado da assinatura e somente leitura

`lib/subscription-state.ts` é o único lugar com os estados, as transições
permitidas e a carência. Nada de `if (status === "past_due")` espalhado.

Dois conceitos que não se misturam: o **estado** é o que está contratado
(`subscriptions.status`); o **nível de acesso** é o que a igreja pode fazer
agora, derivado do estado mais a data — calculado na leitura, como o plano
efetivo, porque não há tarefa agendada.

| Situação | Acesso |
| --- | --- |
| `active`, `trialing` no prazo, `incomplete` | `full` |
| `past_due` até 7 dias após o vencimento | `grace` — escreve, e a tela avisa |
| `past_due` depois disso | `read_only` |
| `canceled`, `expired`, sem assinatura | `full`, no plano gratuito |
| `past_due` sem data de vencimento | `grace` — nunca tranca por falta de dado nosso |

Somente leitura vem de **dívida**, não de ausência de plano pago: quem cancela
ou deixa a avaliação vencer cai para o gratuito e continua escrevendo dentro do
teto dele.

O bloqueio fica em `requirePermission`, e não em cada rota: quando **todas** as
permissões pedidas terminam em `.write`, a chamada é uma escrita. Estar nesse
gargalo é o que impede uma rota nova de nascer furando o modo somente leitura
por esquecimento. Consultar, buscar e exportar continuam valendo, e autenticar
também — login e troca de senha não passam por `requirePermission`.

Quem esbarra recebe **402** com `code: "subscription_read_only"` e uma mensagem
deliberadamente diferente da de teto de plano: são situações distintas, e
misturá-las faria a pessoa tentar a solução errada. `GET /api/auth/session`
devolve `plan.access` com `level`, `graceEndsAt` e `graceDaysLeft`, para a tela
avisar **durante** a carência — avisar depois é tarde.

### Como os tetos são aplicados

O teto sai sempre do plano efetivo; `NULL` é ilimitado; papel não interfere,
porque teto é comercial e não permissão.

| Teto | Conta | Verificado em |
| --- | --- | --- |
| `max_members` | linhas em `members` | criar membro, converter visitante em membro |
| `max_users` | vínculos não suspensos **+** convites pendentes | criar usuário, criar convite, reativar suspenso |

Visitante não conta contra `max_members`. Aceitar convite não é verificado: o
assento já foi reservado quando o convite foi criado, e barrar alguém que
acabou de definir a senha seria pior do que barrar quem convidou.

A verificação é `uso >= teto` **na criação**. Uma organização acima do teto —
porque o plano mudou, ou porque os dados vieram antes da regra — continua
lendo e editando tudo que tem; ela só não cresce mais. Nada é apagado e
ninguém perde acesso.

Quem esbarra recebe **402** com `code: "plan_limit_reached"` e, no corpo,
`resource`, `limit`, `current`, `plan`, `trialExpired` e `suggestedPlan`. Quem
caiu da avaliação para o gratuito recebe uma mensagem própria, que diz que a
avaliação terminou e que o que já existe continua disponível — é o momento em
que a pessoa decide assinar ou abandonar.

`GET /api/auth/session` devolve `plan` com `source`, `trialEndsAt`,
`trialDaysLeft`, `trialExpired`, os tetos e o `usage` atual, para a tela avisar
**antes** de a pessoa esbarrar. Fica só nessa rota, e não no `requireSession`,
para não custar uma consulta a mais em toda requisição autenticada. A mensagem em pt-BR
diz o teto, onde a igreja está e qual plano resolve — quem esbarra é quem a
gente quer que assine. O plano sugerido sai do banco (`trial_days = 0`, o mais
barato que resolve), então `avaliacao` nunca é sugerido como upgrade.

## Contratação sem gateway (bypass)

Não há integração de pagamento. A igreja escolhe um plano, clica, e a
assinatura passa a valer na hora — é atalho de desenvolvimento, porque o
produto roda localmente e não há URL pública para receber webhook.

| Rota | Papel | O que faz |
| --- | --- | --- |
| `GET /api/billing/plans` | `billing.read` | planos contratáveis, o atual e `canSubscribe` |
| `POST /api/billing/subscribe` | `billing.write` | ativa o plano na hora |
| `POST /api/billing/cancel` | `billing.write` | cancela; a igreja volta ao gratuito |

**Só existe com `BILLING_BYPASS=1` no ambiente, e nunca em produção.** Sem a
variável as rotas respondem 404. Com ela e `NODE_ENV=production`, as rotas
continuam respondendo 404 e o servidor grita no log — porque o que isto faz é,
literalmente, "clicar e ganhar o plano pago", e num ambiente hospedado seria
uma falha de cobrança.

A assinatura nasce com status `active` direto, sem passar por `trialing`,
porque o efeito pedido é "clicou, adquiriu". A consequência é que a regra 1 do
plano efetivo passa a valer sem que pagamento nenhum tenha existido: **o status
não distingue uma assinatura paga de uma assinatura dada.** `provider =
'bypass'`, o `provider_subscription_id` prefixado e a linha em `billing_events`
são a única coisa que separa as duas no banco, e é disso que depende quem for
somar faturamento um dia. Nenhuma linha é criada em `subscription_payments`,
porque não houve pagamento.

Quando a integração real entrar, `lib/billing-bypass.ts` e `app/api/billing/`
são apagados inteiros. `lib/subscription-state.ts` não sabe que o bypass
existe, e continua igual.

## Exportação em CSV

`GET /api/export/members`, `/api/export/visitors` e `/api/export/financeiro`
devolvem CSV como download. Exigem, respectivamente, `members.read`,
`visitors.read` e `finance.read`, e são escopadas por organização como
qualquer outra leitura.

**Funcionam em modo somente leitura, e esse é o ponto**: exportar é leitura, e
a guarda de escrita só dispara quando todas as permissões pedidas terminam em
`.write`. É a garantia de que uma igreja com pagamento atrasado não fica refém
do próprio cadastro.

O formato é decidido pelo Excel brasileiro, que é quem vai abrir o arquivo:

| | Escolha | Por quê |
| --- | --- | --- |
| Separador | `;` | é o que o Excel pt-BR espera; com `,` tudo cai numa coluna só |
| Codificação | UTF-8 **com BOM** | sem o BOM, "João" vira "JoÃ£o" |
| Quebra de linha | CRLF | RFC 4180, e o que o Excel prefere |
| Datas | `dd/mm/aaaa` | e `"2026-09-06"` é lido como texto, não como instante, senão o fuso atrasa tudo um dia |
| Valores | vírgula decimal, sem milhar | o separador de milhar atrapalha o Excel a reconhecer a célula como número |

Célula que começa com `=`, `+`, `-` ou `@` é **fórmula** no Excel, e o dado vem
de formulário aberto. Todo texto exportado leva um apóstrofo à frente nesse
caso: a célula vira texto, o apóstrofo não aparece na planilha, e ninguém
executa fórmula alheia ao abrir o arquivo.

O anexo do comprovante não vai no CSV — é base64 e faria a planilha pesar
megabytes por linha. Vão "Comprovante: Sim/Não" e o nome do arquivo.

Os filtros aceitam os mesmos nomes e a mesma semântica dos filtros da tela,
para "exportar o que estou vendo" ser verdade: `search`, `ministry`, `status` e
`baptism` em membros; `search`, `tab` e `invitedBy` em visitantes; `search`,
`type`, `status`, `category` e `attachment` no financeiro. Os que são lista
aceitam tanto o rótulo da tela (`Ativo`) quanto o valor do banco (`active`).

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
