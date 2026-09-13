# nonia — estado do projeto

Plataforma de gestão ministerial (membros, visitantes, células, ministérios,
agenda, financeiro) sendo transformada em **SaaS multi-igreja**.

Este arquivo descreve **o que existe hoje**, **o que foi decidido** e, na parte
final, as **convenções de código** (que antes moravam no `AGENTS.md`). Como
rodar o projeto está no [`README.md`](README.md). Não duplique conteúdo entre os
dois.

> Última reconciliação com a realidade: **07/09/2026**, o dia em que a produção
> subiu. Se algo aqui divergir do que você observar, **o observado ganha e este
> arquivo precisa ser corrigido** — é por essa regra que esta reconciliação
> existe, e a de 06/09/2026 antes dela. Um arquivo que todo agente lê ao entrar
> no projeto envelhece pior que código: ninguém compila documentação.

## Estado real — 07/09/2026

| Item | Situação |
| --- | --- |
| Produção | **Existe desde 07/09/2026:** **https://nonia.lucascriado.com**, `running:healthy`. É **subdomínio de `lucascriado.com`**, e não `nonia.app` — ver "Produção" |
| Aplicação no Coolify | **Existe de novo**, criada em 07/09/2026 no projeto `nonia.app`. **Não é a de 06/09/2026** — aquela foi excluída e continua morta. Uuid, container e destino vivem em `/home/lucas/claude.md`, não aqui: o repositório é público |
| Base `postgres` do servidor | **É a base de PRODUÇÃO desde 07/09/2026**, com as migrations **001–023**. **Deixou de ser vazia no mesmo dia:** o **seed de demonstração** foi levado para lá por decisão do Lucas. **Não há igreja real** — ver "Produção". O baseline vazio (`~/backups/nonia-2026-09-06.sql`) virou **histórico**, não é mais o estado |
| Domínio `nonia.app` | **Continua não respondendo**, e nada aponta para ele. Isso **não** significa "não há produção": ela mora em `nonia.lucascriado.com`. O nome `nonia.app` sobrevive como nome do **projeto** no Coolify, o que engana quem lê rápido |
| Autenticação | **Integrada na `main`** em 06/09/2026. Sessão própria, RBAC e escopo de tenant em todas as rotas de `app/api` |
| Multi-tenancy | **Integrado na `main`.** `organization_id` em toda tabela de domínio, com backstop de FK composta no banco |
| Integração | **Feita em 06/09/2026**, `main` em `4b67d08`: Fase 1 e site público mesclados, `typecheck` limpo e `build` passando contra o `nonia_dev`. Depois disso a `main` seguiu andando — o que entrou hoje está em "O que entrou em 07/09/2026" |
| Banco de desenvolvimento | **Contorno desta máquina, não a arquitetura pretendida** — ver "Por que existe um banco compartilhado". `nonia_dev`, no Postgres do Coolify (**18.6**), base separada da `postgres`, com as migrations **001–023** aplicadas e o seed rodado. Não há PostgreSQL nesta máquina — o acesso é pelo túnel SSH `nonia-db-tunnel.service`, que escuta só em `127.0.0.1:5432`. Detalhes com o admin de VPS, em `/home/lucas/claude.md` |

> **O mesmo cluster hospeda a produção e os bancos de desenvolvimento**, e a
> aplicação de produção entra nele como **superusuário** — escolha do Lucas em
> 07/09/2026, registrada com a consequência em `/home/lucas/claude.md`. Não é
> convite para apontar dev para a base `postgres`: continua sendo a produção.

### Produção — no ar desde 07/09/2026

**Decisão do Lucas em 07/09/2026, que reverte a de 06/09/2026:** o nonia, o
Postgres dele e o gateway de WhatsApp ficam **online**. O site é
**https://nonia.lucascriado.com** — **subdomínio de `lucascriado.com`**, não
`nonia.app`. O porquê do subdomínio é de infra e está com o admin de VPS, em
`/home/lucas/claude.md`.

**O auto-deploy está DESLIGADO de propósito, e quem manda deployar é o gerente.**
Não é configuração esquecida: quatro frentes trabalham na `main` e **todo deploy
roda as migrations no boot do container**. Com auto-deploy, o push de qualquer
uma viraria migration em produção sem ninguém decidir.

> ### Produção tem dado de DEMONSTRAÇÃO, e nenhuma igreja real
>
> Ela subiu vazia em 07/09/2026 e **deixou de ser vazia no mesmo dia**: o **seed
> de demonstração** foi levado para produção por decisão do Lucas. Não há igreja
> real, não há usuário real, e **nada do que existe foi exercitado por alguém de
> verdade**.
>
> **Produção passou a ser validada com sessão real**, e não só por `health`:
> login **200**, painel com as quatro seções desenhando dado, e `/api/members`,
> `/api/visitors?aba=recentes` e `/api/events` em **200**. Isso prova que o
> sistema **responde logado** em produção — não prova nada sobre uso real,
> porque o dado do outro lado é o seed. Todo "medido", "verificado" e "percorrido" deste arquivo se refere
> ao **`nonia_dev`** e ao **`nonia_front`**, salvo onde estiver escrito o
> contrário. Deploy que sobe não é funcionalidade exercitada, e chamar uma coisa
> da outra é o mesmo erro do `build` passando: artefato não é evidência de
> comportamento.
>
> **Deixar de ser banco vazio muda o peso de toda migration daqui para a
> frente.** Enquanto produção tinha 0 linhas, uma migration errada custava um
> `DROP` e um redeploy. Agora existe dado lá dentro, e mesmo sendo dado de
> demonstração ele já é o que prova que uma migration destrutiva funciona ou
> não. A próxima que chegar depois da primeira igreja real não terá nem esse
> ensaio.
>
> O `/cadastro` é **público**. A primeira pessoa que se cadastrar cria uma
> **igreja de verdade**, com dono, na base de produção.

A regra que valia até a integração — a autenticação não entra na `main` antes
das telas de login existirem — foi **cumprida**: as duas branches entraram
juntas, com `/entrar`, `/cadastro` e `/convite/[token]` prontas. Vale registrar
o critério, porque ele se repete: nada que exija uma tela entra sem a tela, ou o
ambiente local do time para de funcionar.

> **Estado do `nonia_dev` em 06/09/2026:** Igreja Demonstração com **1 de 5
> acessos**, 0 convites pendentes, 18 membros e avaliação com 14 dias. Os três
> convites de teste foram limpos. `/usuarios` foi exercitada de verdade contra
> esse banco: sem sessão responde **307** para `/entrar`, com sessão **200**.

> **O PostgreSQL embarcado na porta 54329 não é do nonia.** Ele pertence a
> outra sessão de agente nesta máquina e não faz parte do projeto — não aponte
> a `DATABASE_URL` para ele. O banco de desenvolvimento é o `nonia_dev` pelo
> túnel, em `127.0.0.1:5432`.

## Repositório e worktrees

`git@github.com:lucascriado/nonia.git` (público). Desenvolvimento em **Linux**,
em `/home/lucas/www/`.

| Worktree | Branch | Dono |
| --- | --- | --- |
| `/home/lucas/www/nonia` | `main` | gerente — **só integração** |
| `/home/lucas/www/nonia-auth` | `feat/auth-multitenant` | backend/DBA |
| `/home/lucas/www/nonia-ui` | `feat/ui-theme` | frontend |
| `/home/lucas/www/nonia-docs` | `docs/reconciliacao` | documentador |

As três branches estão em `origin` desde 06/09/2026.

### Regras de processo

- **Dê push na sua branch** ao terminar cada bloco de trabalho, sem pedir
  permissão. É backup: até 06/09/2026 o dia inteiro de trabalho existia em uma
  máquina só.
- **Ninguém dá push na `main`** — ela é a árvore de integração e é do gerente,
  que faz o merge das branches quando a hora chega. **Desde 07/09/2026 há
  produção atrás dela.** O push não publica sozinho, porque o auto-deploy está
  desligado; mas é a `main` que vira produção no dia em que o gerente mandar
  deployar. Ver "Ninguém dá push".
- **O repositório é público.** Antes de qualquer push, confira que o diff não
  leva senha, token, uuid de infra, IP nem conteúdo de `.env`. É por isso que a
  regra de manter identificador de infra fora do repo existe.
- **Um segredo chega a um texto por dois caminhos, e a regra acima só pega um.**
  Alguém colar o valor é ato deliberado, e a regra pega. **O shell expandir sem
  ninguém colar não é ato nenhum, e a regra não pega** — é o que exige a
  convenção "Segredos e interpolação", em "Convenções de código".
- **Integrar branch que traz migration inclui rodar `npm run db:migrate` contra
  o `nonia_dev`, na mesma operação, antes de anunciar a integração.** Não é
  opcional e não depende de alguém pedir — o banco é compartilhado e ninguém
  mais tem permissão de aplicar por conta própria. Ver "Migration órfã".
- **Quem entrega uma rodada com migration nova avisa explicitamente no
  relatório.** Teste em banco efêmero é o certo — teste destrutivo não toca o
  banco compartilhado —, mas justamente por isso o compartilhado **nunca**
  recebe a migration por efeito colateral de teste.
- **Trabalhe só no seu worktree**, inclusive para documentação. O
  `/home/lucas/www/nonia` é onde o gerente troca de branch e faz merge: edição
  não commitada ali é varrida para dentro de um commit de merge, e foi o que
  aconteceu em 06/09/2026 com duas mudanças de documentação — o conteúdo
  sobreviveu, as mensagens de commit não.
- `CLAUDE.md`, `README.md` e `database/README.md` são mantidos pelo
  documentador — um arquivo, um dono
  (decidido em 06/09/2026). Devs não editam esses arquivos nas branches;
  mandam o conteúdo técnico pelo gerente.
- Nada que exija uma tela entra na `main` sem a tela — senão o ambiente local
  do time para de funcionar.

## Stack

Next.js 16 (App Router) + React 19 em TypeScript, Sequelize v6 sobre `pg`,
CSS global com design tokens (sem Tailwind), `lucide-react` nos ícones e
`sonner` nos toasts. Fonte **Inter** via `next/font/google`.

Estrutura da `main` hoje:

```
app/
  (marketing)/  site público: page.tsx (/), faq/, entrar/, cadastro/,
                convite/[token]/, marketing.css, plans.ts
  (app)/        sistema logado: painel/ atividades/ calendario/ configuracoes/
                financeiro/ membros/ ministerios/ usuarios/ visitantes/
  api/          route handlers, incluindo api/auth/ e api/users/
  layout.tsx  globals.css  icon.svg
proxy.ts        desvio de navegação no Edge (era middleware.ts)
components/     shell, sidebar, header, diálogos, skeletons, marketing/
lib/            db.ts, models.ts, auth.ts, tenant.ts, passwords.ts, http.ts,
                datas.ts ("hoje" no fuso da igreja), finance-kardex.ts,
                whatsapp/, …
database/       migrate.mjs, migrations/ (001–023), seeds/
```

Os parênteses são route groups e **não** aparecem na URL.

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

Onde a decisão depende de um fato técnico que pode mudar, **a condição de
reabertura está escrita junto**. Não é convite para reabrir: é o contrário —
decisão sem condição declarada é a que alguém desfaz em silêncio, por não ter
com o que comparar a situação nova. Decisão que é gosto, e não fato, não tem
condição e não ganha uma inventada.

Em decisão **suspensa**, a condição de **retomar** e a de **reabrir** são
escritas separadas. Retomar é executar o que já foi decidido; reabrir é discutir
de novo a escolha. Juntas, retomar o assunto convida a refazer do zero uma
análise que já existe — e a chegar a outra conclusão sem conhecer o motivo da
primeira.

| Decisão | Conteúdo | Data |
| --- | --- | --- |
| **SaaS multi-igreja** | Cada igreja é uma `organization` (tenant). `organization_id` em toda tabela de domínio, isolamento total entre organizações | 06/09/2026 |
| **Autenticação própria** | Sessão persistida em tabela + cookie httpOnly. **Sem Auth.js/NextAuth** | 06/09/2026 |
| **Sem `AUTH_SECRET`** | O token de sessão é aleatório e **opaco**; o banco guarda só o SHA-256 dele. Não é JWT, não há nada para assinar — **não reintroduza essa variável**. A variável nunca chegou a ser aplicada em lugar nenhum (verificado no banco do Coolify em 06/09/2026) | 06/09/2026 |
| **E-mail de usuário é único GLOBAL** | A identidade é `users`; o vínculo com cada igreja mora em `organization_members`. A mesma pessoa administra duas igrejas com um login só, e `POST /api/auth/switch` troca a organização ativa | 06/09/2026 |
| **Senha com scrypt do `node:crypto`** | `N=2^15, r=8, p=1`, `maxmem` 96 MB. Escolhido porque bcrypt e argon2 exigem **dependência nativa**, que quebraria o `output: "standalone"` do Dockerfile e traria compilação para o deploy. O hash guarda os próprios parâmetros, então dá para subir o custo depois sem invalidar senha antiga. **Reabrir se** o build deixar de ser `standalone` — é ele que torna dependência nativa um problema | 06/09/2026 |
| **Secretaria lança no financeiro** | Migration **009**, que **reverte** a decisão da manhã. A restrição nasceu de um chute conservador decidido no abstrato; percorrer a jornada mostrou o efeito prático: a secretaria cadastra membro, visitante, célula, ministério e evento, e leva 403 ao lançar o dízimo — na igreja de verdade isso vira o pastor digitando, ou alguém usando a conta dele. **Atenção ao tamanho do que foi concedido:** o modelo só tem `read` e `write`, então ela passa a lançar, corrigir **e excluir**. Ver Pendências | 06/09/2026 |
| **Planos comerciais definidos** | Semente, Comunidade e Rede — ver "Planos comerciais" abaixo | 06/09/2026 |
| **Pagamento: Mercado Pago** | Escolhido pelo requisito de CPF (Pix/boleto). O schema de planos/assinaturas é **agnóstico ao gateway**: colunas `provider*` guardam o id externo, nenhuma regra de domínio depende do MP. **Reabrir se** o requisito de CPF com Pix/boleto cair — é ele que escolheu o gateway, e o schema já não amarra | 06/09/2026 |
| **Route groups** | `app/(marketing)/` para o site público e `app/(app)/` para o sistema logado. Route group não entra na URL; a única rota que mudou foi a dashboard, de `/` para **`/painel`** | 06/09/2026 |
| **Cadastro nasce em avaliação e cai para o Semente** | Quem se cadastra entra em **avaliação de 14 dias**; terminado o prazo sem assinar, cai para o **Semente gratuito, sem expirar**. Resolve a divergência entre o `register`, que atribuía `avaliacao`, e a landing, que promete gratuito para até 100 membros sem prazo — as duas frases passam a ser verdadeiras. Ver "Plano efetivo" | 06/09/2026 |
| **Mensalidade vencida vira somente leitura** | Não bloqueio de acesso. O dado é ficha de membro e financeiro de igreja: trancar a igreja para fora do próprio cadastro por um boleto atrasado é desproporcional, e com Pix e boleto o atraso é quase sempre humano. **Consultar, buscar e exportar continuam** — somente leitura não pode virar sequestro de dado; se a igreja quiser sair, leva o que é dela. Ver "Assinatura e acesso" | 06/09/2026 |
| **Cancelar avaliação vigente é recusado** | `409 trial_not_cancelable`. Parece restritivo e não é: quem clica quer uma de duas coisas e nenhuma é atendida. "Não quero ser cobrado" já está garantido — a avaliação termina sozinha e a igreja cai no gratuito. "Quero sair do produto" é apagar a conta, que é outra coisa e não existe. Em troca, a ação seria **irreversível**: perde os dias restantes e não há volta para `trialing`, nem contratando. **Ação irreversível sem benefício nenhum é caso de recusar, não de confirmar na tela.** Só vale enquanto a avaliação é **válida** — vencida é linha morta, e recusar ali produziria a mensagem errada; `incomplete` continua cancelável | 06/09/2026 |
| **`slug` da organização não é editável** | `400 slug_not_editable`, em vez de ignorar em silêncio — ignorar faria a pessoa achar que mudou. Ele aparece no nome dos arquivos exportados e é aceito como identificador no login. O argumento é assimétrico: a igreja **não vê o slug em tela nenhuma**, então não poder editar não custa nada; desfazer link quebrado custa | 06/09/2026 |
| **`timezone` não é exposto na tela** | **Reescrita duas vezes em 07/09/2026, e o caminho da coluna é a lição:** ela nasceu órfã ("nada no código a usa"), virou base do lançamento retroativo e do kardex, e ao fim do dia virou **a base da regra de data do sistema inteiro** — toda data sugerida ou validada sai dela, via `lib/datas.ts`. Guardar a coluna órfã foi o que tornou a correção do UTC possível sem migration de schema. O que continua de pé, e só isso, é **não colocar seletor de fuso na interface**: o valor é o default `America/Sao_Paulo` da 004 para todo mundo, e uma igreja em Manaus só sai disso por `UPDATE`. Seletor entra quando houver igreja em outro fuso, não antes | 06/09, reescrita duas vezes em 07/09/2026 |
| **Perfil próprio em rota própria** | `PATCH /api/auth/profile`, não um caso especial dentro de `/api/users/[id]` — aquela rota existe para agir sobre **terceiros**, e todas as guardas dela são recusas de agir sobre si | 06/09/2026 |
| **Coluna órfã fica; permissão órfã sai** | A `timezone` ficou — e em 07/09/2026 **deixou de ser órfã e virou a base da regra de data do sistema**. A decisão de guardá-la foi paga com juros: sem a coluna, corrigir o UTC teria exigido migration de schema em produção. As `people.*` saíram na migration **010**. A coluna **não promete nada a ninguém**, porque não aparece em lugar nenhum; a permissão aparece no seletor de papéis e promete poder que não existe. Papéis agora: owner 22, admin 21, secretaria 18, líder 12, leitura 9 | 06/09/2026 |
| **Carência de 7 dias** | Contados do vencimento, antes de virar somente leitura | 06/09/2026 |
| **Somente leitura vem de DÍVIDA, não de ausência de plano pago** | Cancelar leva ao gratuito, com o teto do gratuito; **atrasar** leva a somente leitura. Sem essa distinção, cancelar seria melhor que atrasar e o somente leitura seria contornável em um clique | 06/09/2026 |
| **Exportar entra no MVP** | A promessa "quem quiser sair leva o que é seu" só era verdadeira pela API — não havia botão de exportar em lugar nenhum. Decidido implementar em vez de recuar a promessa. Formato e cuidados em "Exportação em CSV" | 06/09/2026 |
| **Bypass de contratação no lugar do gateway** | A igreja clica e a assinatura vale na hora, sem pagamento real. Atalho de desenvolvimento, **não é produto**, e nasce com guarda-corpo obrigatório. Ver "Cobrança" | 06/09/2026 |
| **Mercado Pago: API de Pagamentos, não recorrência** | `POST /v1/payments`, Checkout Transparente. **Decisão suspensa**, não revogada: vale para quando o pagamento real entrar. **Retomar quando** houver hospedagem com URL pública. Ver "Cobrança" | 06/09/2026 |
| **`public/` fica versionado, mesmo vazio** | O `Dockerfile` faz `COPY` dele. A alternativa era remover a linha do `Dockerfile`, e foi descartada: `public/` é o **diretório padrão do Next** para estáticos, então remover a linha resolveria hoje e criaria uma armadilha no dia em que alguém puser um arquivo lá e ele não aparecer na imagem. O `.gitkeep` traz um comentário dizendo por que existe | 06/09/2026 |
| **`cell_members.joined_at` FICA com o `DEFAULT CURRENT_DATE`** | Das três colunas com o mesmo defeito, esta não foi consertada **por decisão, não por cansaço**: ela é **escrita pelo default e nunca lida por ninguém** — varredura em `app`, `lib`, `components`, `database` e os CSV. É **órfã invisível**, e a regra do projeto já resolvia o caso: **órfã que promete sai, órfã invisível fica**. Mesmo critério da `timezone` e das marcas `is_new`/`is_recent`. **Reabrir se** alguém passar a ler a coluna — aí ela promete | 07/09/2026 |
| **Responsáveis do evento apontam para `people`, não para `members`** | E foi **provado, não deduzido**: apagaram a ficha de membro de uma pessoa e os vínculos sobreviveram. Ficha de membro pode ser apagada **sem a pessoa sumir**; apontando para `members`, quem deixasse de ser membro **sumiria do evento do ano passado**, reescrevendo o passado. A tela **oferece membros no seletor** — isso é **filtro de quem aparece**, não o que se grava; confundir os dois é o erro | 07/09/2026 |
| **A data do lançamento sai do fuso da IGREJA** | Decisão do Lucas em 07/09/2026, fechando a pendência do UTC: o "hoje" do sistema vem de `organizations.timezone`, e **não** de uma constante `America/Sao_Paulo`. Fixar a constante teria consertado Brasília e mantido o defeito para qualquer igreja em outro fuso — e o produto é vendido para "várias congregações". `lib/datas.ts` é o único lugar que faz essa conta. Ver "A data do lançamento" | 07/09/2026 |
| **Formas de pagamento múltiplas: escopo pequeno, de propósito** | A 021 atende **lançamento novo** e mais nada. Kardex, CSV de exportação e listagem do financeiro **não foram tocados** — é decisão, não omissão, e é ela que explica a coluna `payment_method` guardar `'Dividido'`. Ver "Formas de pagamento" | 07/09/2026 |
| **Ctrl+K dispara pelo atalho DA PLATAFORMA** | Cmd+K no Mac, Ctrl+K no resto, **sem olhar o foco**. A guarda anterior protegia o *kill-line* do Cocoa em **toda** plataforma — e no Linux/Windows, onde esse kill-line **não é padrão**, ela matava em silêncio justamente o atalho que a interface anuncia no `<kbd>`. Proteção que só atuava onde não havia o que proteger, contra um atalho anunciado que não funcionava: **atalho anunciado e morto é pior que atalho inexistente, porque a pessoa culpa a si mesma.** Hoje a guarda vale só para o modificador que **não** é o da plataforma — na prática, o Ctrl no Mac. **Custo aceito e escrito:** no Linux com keymap emacs, Ctrl+K num campo abre a busca em vez de apagar a linha | 07/09/2026 |
| **Tema sage/verde-floresta FICA** | Uma paleta índigo foi proposta e **reprovada pelo Lucas em 06/09/2026**. O commit da proposta já foi revertido na branch de UI. Não reabrir | 06/09/2026 |

### Rotas públicas decididas

`/` (landing), `/faq`, `/precos`, `/cadastro` e `/entrar` (login, em português,
coerente com o resto). Tudo o mais é `(app)` e exige sessão.

`/entrar` é fato consumado dos dois lados: `middleware.ts` da branch de auth já
usa `LOGIN = "/entrar"` e o frontend aponta para lá em
`components/marketing/routes.ts`.

## O que a integração de 06/09/2026 trouxe

As duas branches entraram na `main` sem nenhum conflito de código. Os únicos
conflitos foram nos arquivos de documentação, resolvidos a favor da versão do
documentador.

### Do backend/DBA — `feat/auth-multitenant`

Validação do backend na árvore já integrada, **por comportamento e não só por
compilação**: **107 casos contra um banco novo, com as 7 migrations aplicadas do
zero, 0 falhas**. `typecheck` e `build` limpos.

Verificado junto que **toda tela de `app/(app)` está na lista de rotas
protegidas do `proxy.ts`** — nenhuma ficou desprotegida. Vale registrar porque
lista explícita é lista que envelhece calada: tela nova que ninguém acrescente
ali passa a ser tratada como página pública. Hoje a lista está em dia.

- Migrations **004** (organizações, usuários, sessões, RBAC, convites, planos e
  assinaturas), **005** (`organization_id` nas 11 tabelas de domínio, com
  backfill), **006** (backstop de isolamento no banco) e **007** (planos
  comerciais). Todas idempotentes e transacionais.
- `lib/auth.ts` (sessão, `requireSession`/`requirePermission`/`requireRole`),
  `lib/passwords.ts`, `lib/tenant.ts`, `lib/http.ts`, `lib/invitations.ts`,
  `lib/organizations.ts`, `lib/cell-membership.ts`.
- `proxy.ts` no Edge (era `middleware.ts`): só desvia navegação pela presença
  do cookie `nonia_session`; quem valida de verdade é o handler.
- **13 endpoints** de autenticação e gestão de usuários; escopo de tenant em
  todas as rotas de `app/api`. Contrato em "Autenticação e multi-tenancy", nas convenções.
- Papéis com nível: `owner` (100), `admin` (80), `secretaria` (60), `lider`
  (40), `leitura` (20), e 24 permissões `recurso.acao`.
- Acesso de dev após `npm run db:seed:dev`: `demo@nonia.app` / `demo1234`.
  `npm run auth:owner` cria o proprietário de uma organização órfã.

### Do frontend — `feat/ui-theme`

Numa segunda leva (`562e267`) entraram `/precos` e o conserto do parâmetro de
retorno do login — o bug de junção descrito em "Armadilhas conhecidas", que
nenhuma das branches conseguia enxergar sozinha.

Numa terceira (`cbc31c1`), o calendário no celular e a avaliação de 14 dias
contada nas telas:

- **Calendário em 390px: "mês para achar, agenda para ler".** O mês vira
  navegação — número do dia e até três pontos de evento, com o dia inteiro como
  alvo de toque — e o conteúdo vai para a agenda do dia. A visão Semana empilha
  os sete dias em vez de rolar de lado. A barra de controle caiu de ~250px para
  133px. **No desktop nada muda de aparência.**
- A avaliação de 14 dias entrou no herói, no CTA, na seção de planos, no
  `/cadastro`, nas dúvidas — com uma pergunta nova sobre o 15º dia — e numa
  faixa em `/precos`. O texto aprovado pelo Lucas ficou intacto; só ganhou a
  primeira metade da história.

- Route groups `(marketing)` e `(app)`, dashboard em `/painel`, título próprio
  por tela.
- Site público: landing em `/`, FAQ em `/faq`, e as telas de sessão `/entrar`,
  `/cadastro` e `/convite/[token]`.
- Ajustes de responsividade no celular e correções do tema escuro.
- Os PNGs placeholder saíram do repositório, e `public/` foi junto — o que
  quebrou o `COPY` do `Dockerfile`. **Corrigido em `488cc3d`**, recriando
  `public/` com um `.gitkeep`.

### Quarta leva — `154cacc`

Os tetos de plano passaram a ser **aplicados**: `lib/plan-limits.ts` e a
migration **008**, que renomeia `plans.max_people` para `plans.max_members`. A
verificação entrou em `app/api/members`, `app/api/users` e na conversão de
visitante em membro, e trava a linha da assinatura dentro da transação para que
duas criações simultâneas não furem o teto juntas.

### Quinta a sétima levas — `a0a3fb7`, `c29dc74`, `ed865cd`

- **Somente leitura e contratação sem gateway** (`a0a3fb7`):
  `lib/subscription-state.ts` e `lib/billing-bypass.ts`, com as rotas de
  `app/api/billing`.
- **Conserto de sobreposição, escala de espaço e centralização** (`c29dc74`).
- **Exportação em CSV** (`ed865cd`): `lib/csv.ts` e `app/api/export/{members,
  visitors,financeiro}`. **A API está pronta; o botão ainda não existe.**

### Migration órfã — incidente de 06/09/2026

`GET /api/auth/session` respondia **500** na `main` com
`column p.max_members does not exist`. O `nonia_dev` estava na `007`, com a
coluna ainda chamada `max_people`, enquanto o código integrado já consultava
`max_members`. Resolvido rodando `npm run db:migrate` contra o `nonia_dev`.

Duas causas, e nenhuma é descuido de uma pessoa:

- O backend testa em **Postgres efêmero**, que é o certo — teste destrutivo não
  pode tocar o banco compartilhado. A consequência é que o compartilhado nunca
  recebe a migration como efeito colateral de teste: ela fica órfã.
- A integração verificou `typecheck` e `build`, **que não abrem conexão com o
  banco**, e chamou de verificado.

> **Build passando não é prova de que o schema está aplicado.** É o mesmo falso
> positivo do `.next`: artefato de compilação não é evidência de que o sistema
> funciona. As regras de processo acima existem por causa deste incidente.

Foi encontrado porque o frontend testou a troca de senha **ponta a ponta contra
o banco de verdade**, em vez de confiar no contrato — a terceira vez no dia em
que testar contra a realidade derrubou algo que passara em `typecheck` e
`build`. E foi encontrado sem estrago porque quem achou **não** rodou a migration
por conta própria: banco compartilhado não é território de quem está numa branch.

### Oitava a décima primeira levas

- `132c209` — conserto do impasse e `finance.write` para a secretaria.
- `4edf490` — recusa de cancelar avaliação, `400 invalid_json` e e-mail de convite.
- `22d9153` — `/visitantes`, faixa de plano e tela de contratação.
- `23ae724` — tela de usuários e arranjo de `/financeiro`.

**Dois defeitos gerais consertados no caminho**, ambos de classe e não de tela:

- **Corpo JSON malformado devolvia 500 em todas as rotas** — o `request.json()`
  estourava e caía no catch genérico. Agora é `400 invalid_json`, por um
  `readJson` comum; não sobrou nenhum `request.json()` cru em `app/api`.
- **A atividade de contratar e cancelar era gravada numa segunda transação.** Se
  ela falhasse, a assinatura já tinha mudado, o chamador recebia 500, reenviava
  e levava `409 already_subscribed` — achando que não funcionou quando havia
  funcionado.

### Estado do MVP — sem bloqueadores (06/09/2026)

**Testes versionados: 12 casos, em 3 arquivos de `tests/`** — `geometria` 2,
`listagem` 6, `sessao` 4. **Não há suíte de backend no repositório**: medido com
`git ls-files` na `main` e nas duas branches em 06/09/2026. Contagens maiores
que circularam (627 no backend, 51 no frontend) **não se confirmam no código**.

> **A porta de desenvolvimento é a 3111**, não a 3000 — decidido em 07/09/2026.
> Ela já era a convenção de fato: é o `baseURL` padrão do `playwright.config.ts`,
> é onde o Lucas abre o sistema e é o que a equipe usa o dia inteiro. **O defeito
> era o `playwright.config.ts` ser o único lugar que sabia disso:** o script `dev`
> rodava `next dev` puro, então quem seguisse o README subia na 3000 e via a
> suíte de tela falhar por não achar aplicação nenhuma — sem nada apontando para
> a porta como causa. O script passou a fixar a porta (`next dev -p 3111`), o que
> alinha os dois lados de uma vez. **Quem precisar de outra porta passa `-p`
> depois** — é o que a frente de frontend faz na 3112.

**O lado do backend está fechado.** O que resta depende de decisão do Lucas: DNS
para a recuperação de senha, exclusão lógica em membros e visitantes, os
assentos do Semente e o `finance.delete`. O frontend está na primeira suíte de
testes de tela do projeto.

**Os cinco bloqueadores fecharam.** Uma igreja percorre a vida inteira dela pela
interface — cadastra, convida a equipe, lança financeiro, bate no teto,
contrata, atrasa, exporta — **sem ninguém tocar no banco**.

Verificado **rodando**, não compilando: as 10 telas do app e as 5 públicas
respondem 200; `session` traz avaliação com 14 dias e acesso `full`; `users`,
`organization` e `billing/plans` respondem; `canSubscribe` é `true`; o CSV sai
com BOM e CRLF.

**A igreja vazia foi percorrida em 07/09/2026** — organização criada pelo
`/cadastro`, zero linha em toda tabela com `organization_id`. As dez telas
carregam e **nenhuma mente**: cada listagem tem estado vazio próprio, o painel
mostra zeros, a busca global devolve "Nenhum destino encontrado.", os três CSV
saem com 200 e só o cabeçalho, e **nenhuma resposta 4xx ou 5xx** apareceu na
varredura inteira. O **logout foi clicado**: revoga a linha em `sessions` e
voltar ao painel cai em `/entrar`. O que quebra sem dado é outra coisa, e está
em "Pendências" — os ministérios fantasma e o sino. O medido está na nota de
canvas "Estado real do MVP".

## O que entrou em 07/09/2026

**Onde isto foi medido:** `nonia_dev` e `nonia_front`. **Nada disto foi
exercitado por usuário de verdade em produção**: lá existe o seed de
demonstração e nenhuma igreja real. Subiu no deploy; não foi usado por
ninguém.

### Migrations 018 a 023

**As seis estão aplicadas nos três bancos** — `nonia_dev`, `nonia_front` e
**produção**.

- **018** — `whatsapp_contacts.avatar_url` e `avatar_checked_at`.
- **019** — `financial_transactions.retroactive` e `retroactive_reason`, com
  `CHECK (retroactive_reason IS NULL OR retroactive)`: o motivo não existe sem a
  marca. O `CHECK` **não** compara com `CURRENT_DATE` — não seria imutável e
  dependeria do fuso da sessão, que é exatamente o defeito que a 019 não quis
  herdar.
- **020** — remove o `DEFAULT` de `financial_transactions.transaction_date`. Ver
  "A data do lançamento".
- **021** — formas de pagamento múltiplas. Ver "Formas de pagamento".
- **022** — responsáveis do evento. Ver "Responsáveis do evento".
- **023** — remove o `DEFAULT` de `members.admission_date` e
  `visitors.visit_date`. Ver "Os três defaults".

### Rotas novas

| Rota | O que faz |
| --- | --- |
| `GET /api/whatsapp/fotos` | foto de perfil de um punhado de conversas, **separada da listagem de propósito**: a lista já paga sincronização e resolução de telefone antes de desenhar, e foto é enfeite de linha — não pode segurar a lista. A tela desenha em dois tempos: primeiro as iniciais, depois as fotos que houver |
| `GET /api/financeiro/kardex` | extrato em ordem, com saldo corrente linha a linha, para imprimir. Sem `de`/`ate`, o mês corrente **no fuso da igreja** |

### Telas

Foto de perfil na lista de conversas do WhatsApp, **kardex imprimível** no
financeiro, seletor de pessoas em cartões e criação de ministério em passos.

### A foto guarda URL, e NÃO bytes — contra o pedido original

`people.avatar_url` guarda a imagem em base64; **`whatsapp_contacts.avatar_url`
guarda a URL**. A diferença é deliberada e o motivo é de propriedade, não de
espaço: **a foto do WhatsApp não é nossa**, e a URL do `pps.whatsapp.net`
**expira**.

> **Daí um requisito, não um zelo:** a imagem tem que cair para as iniciais no
> **`onError`**, e não só quando o campo vem nulo. Uma URL guardada continua
> parecendo válida no banco depois de morrer, e é o navegador que descobre.
> **É o mesmo caminho de quem removeu a foto no WhatsApp** — os dois casos
> chegam na tela como imagem que não carrega, e a tela não sabe distinguir.

Os três estados de `avatar_checked_at` estão comentados na própria 018:
nunca perguntamos; perguntamos e não há; temos foto, válida até expirar.

### O kardex é leitura pura, e a ordem dele é o conteúdo

Sem migration, sem coluna nova, sem gravar nada.

> **A tela NÃO pode reordenar as linhas** — nem por valor, nem por categoria,
> nem clicando no cabeçalho. **Saldo corrente só existe na ordem em que o
> dinheiro andou.** Reordenado, cada linha continua mostrando um saldo, e o
> saldo passa a ser mentira: a coluna vira uma sequência de números que não
> corresponde a movimentação nenhuma. Ordenação em tabela é gesto tão comum que
> alguém a acrescenta por simetria com as outras listagens — esta não é como as
> outras.

### `lib/datas.ts` — "hoje" no fuso da igreja

Nasceu com o lançamento retroativo e, **naquele momento**, não consertava o
defeito de UTC: existia para **impedir que uma regra nova nascesse em cima do
defeito**. A regra do retroativo é inteiramente sobre data — com o "hoje" de UTC
ela erraria três horas por dia, justamente no horário em que a secretaria lança
o culto da noite.

Usa `organizations.timezone`, com `America/Sao_Paulo` de fallback.

> **No mesmo dia ele deixou de ser contenção e virou a fonte da verdade.** A
> correção do UTC, mais tarde em 07/09/2026, apontou os quatro lugares para cá —
> é o **único** lugar do projeto que calcula "hoje". Ver "A data do lançamento",
> logo abaixo. O caminho vale ser lido inteiro: a peça criada para **não piorar**
> um defeito foi a que tornou o conserto barato quando a decisão veio.

### A data do lançamento sai do fuso da igreja — a pendência do UTC FECHOU

**Era a pendência mais antiga em aberto do financeiro, e ela está fechada e em
produção.** A decisão do Lucas foi **usar `organizations.timezone`**, e não
fixar `America/Sao_Paulo`: a constante consertaria Brasília e deixaria o defeito
de pé para qualquer igreja em outro fuso, num produto que vende "várias
congregações".

**O pior caso medido, para dar tamanho ao que fechou:** dia **30/09 às 22h** em
Brasília, o lançamento era gravado em **outubro** — saía do fechamento de
setembro. Foram **6 cenários medidos, 4 erravam antes, e todos acertam agora.**

#### Eram QUATRO lugares, e o arquivo só conhecia três

O quarto era o formulário de **Novo Evento**, em `app/(app)/calendario/page.tsx`,
que sugeria a data com o mesmo `toISOString`.

> **Escrever "são três" era o próprio risco.** Quem consertasse os três do
> financeiro e riscasse a pendência entregaria um **pré-requisito falso**: a
> regra "o sistema usa o fuso da igreja" continuaria mentira no calendário, e o
> próximo a mexer confiaria nela. Lista de lugares afetados é o tipo de coisa
> que envelhece calada — a mesma doença da lista de rotas protegidas do
> `proxy.ts`.

#### O que foi feito em cada um

| Lugar | O que aconteceu |
| --- | --- |
| `lib/models.ts` | **Removido, não consertado.** O `defaultValue` de `transactionDate` era **código morto**: existe um único `FinancialTransaction.create` no projeto e a validação recusa payload sem data. Era um "hoje" errado **esperando a primeira chamada que esquecesse o campo** — consertá-lo teria preservado um caminho que não deve existir |
| `components/financial-record-dialog.tsx` | Tinha **dois** defeitos. Além do fuso, a data era **constante de módulo**: congelava no carregamento da aba, então uma aba aberta desde ontem abria o formulário **com ontem**. Agora `hojeNoFuso()` roda na abertura do diálogo |
| `app/(app)/calendario/page.tsx` | A data sugerida do Novo Evento passou a sair do fuso da igreja |
| Banco (`003`) | O `DEFAULT CURRENT_DATE` saiu — migration **020**, abaixo |

#### O encanamento que tornou tudo possível

**O fuso da igreja passou a chegar ao cliente** (`lib/auth-payloads.ts` e a
sessão). Sem isso não havia conserto possível em formulário: formulário roda no
**navegador**, e um "hoje" calculado lá cairia no **relógio de quem digita** —
acertando em Brasília e errando em qualquer outro lugar, que é o defeito de novo
com outra cara.

#### Migration 020 — o banco NÃO TEM COMO acertar essa data

A 020 **remove** o default de `financial_transactions.transaction_date` em vez
de corrigi-lo, e o motivo é estrutural:

> **Uma expressão de `DEFAULT` do PostgreSQL não pode referenciar outra coluna
> da mesma linha.** Para acertar, o default teria que ler o `organization_id` da
> linha que está nascendo e buscar `organizations.timezone` — e ele não tem
> acesso a isso. **Qualquer default naquela coluna é errado por construção**, e
> um default errado não é rede de segurança: é a rede pegando quem cai e
> gravando o dia errado em silêncio.

A coluna **continua `NOT NULL`**. Omitir a data deixa de gravar o dia errado e
passa a **falhar alto, com `23502`**. Trocar erro silencioso por erro barulhento
é o ponto. A 020 **não toca em linha já gravada** — ver Pendências.

### Formas de pagamento múltiplas — migration 021

**Escopo pequeno por decisão do Lucas:** atende **lançamento novo** e nada mais.
Kardex, CSV de exportação e listagem do financeiro **não foram tocados** — é
decisão, não omissão, e é dela que sai o miolo do desenho.

- **A coluna antiga `payment_method` passa a guardar `'Dividido'`** quando há
  mais de uma forma. Existe para que **os três leitores intocados continuem
  honestos**: com `NULL` a tela mostraria forma em branco num lançamento que
  **tem** forma; com uma das formas, mostraria "Dinheiro" num lançamento que foi
  metade Pix. **Meia verdade é pior que ausência, porque é indistinguível da
  verdade.**
- **Concatenar foi descartado** ("Pix + Dinheiro"): `varchar(40)` estoura com
  três ou quatro formas, e cada combinação viraria um valor distinto —
  agrupamento por forma viraria agrupamento por **combinação**.
- **A invariante é do BANCO e vale nos DOIS sentidos:** lançamento com partes
  tem que estar `'Dividido'`, **e** `'Dividido'` tem que ter partes. **A segunda
  é a que se esquece.**
- **`CONSTRAINT TRIGGER` diferida, e isso não é refinamento:** as partes entram
  **uma a uma**, e uma verificação imediata reprovaria a **primeira parte de
  toda divisão**. `DEFERRABLE INITIALLY DEFERRED` é o que permite a invariante
  existir.
- **Uma parte só NÃO é divisão:** vai como forma única, sem linha na tabela de
  partes. **Duas representações do mesmo estado garantem que um dia discordem.**
- **`'Dividido'` é recusado como forma escolhida pela pessoa.** É **marca**, não
  forma — aceitá-la faria a palavra significar duas coisas.
- Editar um lançamento dividido pelo `PUT` antigo dava **500**; agora é **400**
  com frase que diz o que fazer.
- Precisou de **`UNIQUE (id, organization_id)`** em `financial_transactions`,
  para a FK composta das partes — **mesmo desenho de tenant da 006**, não
  invenção paralela.

#### O critério: por que a 020 recusou trigger e a 021 aceitou

Parece contradição no mesmo dia, e não é. **A pergunta é se a regra já existe em
outro lugar.**

| | |
| --- | --- |
| **020, trigger recusada** | seria uma **segunda implementação** de algo que já mora em `lib/datas.ts`. Duas implementações da mesma regra **divergem um dia** — e a do banco seria a invisível |
| **021, trigger aceita** | é **invariante de integridade**, e não existe em outro lugar. O banco é o único que consegue garanti-la contra qualquer caminho de escrita |

Vale para a próxima: trigger não é proibida nem preferida — ela é o lugar certo
quando a regra **não tem outra casa**, e o lugar errado quando já tem.

### Menores, mas com gênero conhecido

- **Cor do ministério: faltava a regra CSS da cor PADRÃO.** O `emptyMinistry`
  nasce roxo, e o roxo era justamente o tom sem regra — quem criava sem tocar no
  campo escolhia roxo, **via roxo no seletor** e o card saía com outra coisa. O
  campo parecia não fazer nada. **O defeito estava no caso default**, que é o
  caminho que mais gente percorre e o que menos se testa.
- **A busca global prometia procurar eventos e só devolve páginas do sistema.**
  **Trocamos o TEXTO, de propósito** — o `placeholder` agora diz "Buscar páginas
  do sistema…". Não implementamos busca de conteúdo. Se um dia alguém quiser
  busca de eventos, é **feature nova, não conserto** — e a promessa deixou de
  existir enquanto isso.

### O `nextSunday` era PIOR do que a pendência dizia

A pendência descrevia "à noite pode calcular o domingo errado". Medindo, eram
**dois defeitos empilhados em direções diferentes, que não se cancelavam**:

| Passo | O que ele fazia de errado |
| --- | --- |
| `getDay()` / `setDate()` | contavam no fuso da **MÁQUINA** de quem digita |
| `toISOString()` | devolvia a data em **UTC** |

> **Por isso ele errava MESMO EM BRASÍLIA**, onde o fuso da máquina é o certo.
> Não era defeito que só aparecia longe — e essa era a leitura que a pendência
> induzia. Dois erros em direções diferentes não se anulam; se sobrepõem.

**O pior caso não é o que estava escrito.** Num **domingo às 22h**, a função
chamada "próximo domingo" devolvia uma **SEGUNDA-FEIRA**. Quem abrisse a chamada
no fim do culto criaria a de segunda, e **o domingo — o dia em que a reunião
aconteceu — ficaria sem registro**.

**5 de 7 cenários erravam.** O novo `proximoDomingo` foi varrido contra **800
instantes ao longo de um ano** e cai sempre num domingo dentro dos próximos 7
dias.

**O primo de LEITURA também era pior que "menor gravidade".** O `?date=` padrão
da chamada do ministério, das 21h à meia-noite, abria a chamada de **amanhã** e
mostrava **lista vazia num dia em que a reunião tinha acabado**. Quem olha
conclui que ninguém fez a chamada e **REFAZ** — o defeito de leitura vira dado
duplicado pela mão de quem confiou na tela.

#### A regra que o `lib/datas.ts` passou a ter, e que parece contradição

As funções de data usam **acessores UTC por dentro**, num arquivo que existe
para fugir de UTC.

> **É o contrário do que parece.** `'YYYY-MM-DD'` não tem hora, então ler e
> escrever pelos acessores UTC é justamente o que **impede a conta de passar por
> fuso nenhum**. Era **misturar os dois** — `new Date("2026-09-06")` seguido de
> `getDay()` — que fazia o `nextSunday` errar: interpreta como meia-noite UTC e
> devolve o dia da semana no fuso da máquina.
>
> **O fuso entra UMA vez, em `hojeNoFuso`.** Dali em diante a conta é sobre um
> dia do calendário, e dia do calendário não tem fuso.

### Os três defaults `CURRENT_DATE` — e por que a resposta foi o OPOSTO da 020

Na 020 a pergunta **"existe caminho de `INSERT` que OMITE a coluna?"** deu
**não**, e por isso o `DROP DEFAULT` foi seguro. Aqui deu **sim nas três**.

> **Essa pergunta é o método, não uma curiosidade daquele dia.** É ela que
> decide se um `DROP DEFAULT` é limpeza ou se derruba gravação em produção.
> Faça-a antes, sempre, e a resposta muda o que a migration pode fazer.

- **`members.admission_date` e `visitors.visit_date`** — consertadas, em **duas
  etapas** (abaixo). A `visit_date` era a mais afetada: visitante é cadastrado
  logo depois do culto de domingo à noite, dentro da janela em que o
  `CURRENT_DATE` em UTC já virou o dia.
- **`cell_members.joined_at`** — **fica com o default**, por decisão: é escrita
  pelo default e **nunca lida por ninguém**. Ver a tabela de decisões.

#### A regra das DUAS ETAPAS — código num deploy, migration em OUTRO

**Isto quase derrubou produção, e vale para toda migration futura que aperte uma
coluna.**

1. **Primeiro o código** passa a mandar a data — deployado e confirmado em
   produção;
2. **Só depois** a migration remove o default — em **outro** deploy.

> **Por que não pode ser o mesmo deploy.** O `Dockerfile` roda
> `migrate && server`: a migration cai **antes** de o container novo ficar
> saudável, e quem atende durante a subida é o container **VELHO**, com o código
> que ainda omite a coluna. Um cadastro nessa janela levaria **23502** — e seria
> um erro em produção causado pela ordem, não pelo conteúdo.

> **É irmão do que este arquivo já registra sobre a 006** — "validação de
> aplicação primeiro, migration no mesmo lote" —, **mas é mais forte**. Lá o
> requisito era ordem de **commits**; aqui é ordem de **DEPLOYS**. A diferença
> aparece só em produção, e só durante os segundos da subida.

### Responsáveis do evento — migration 022

O vínculo aponta para **`people`** (ver a tabela de decisões).

**`CASCADE` nas duas pontas, e a razão é de FORMA, não de gosto:**

| | |
| --- | --- |
| **006, `SET NULL` com lista** | a coluna é **atributo** de uma linha que continua existindo — apagar o líder não apaga o ministério |
| **022, `CASCADE`** | a **linha É o vínculo**. "Este evento tem um responsável que é ninguém" **não é estado do mundo, é lixo**. E `person_id` é parte da **PK**, logo `NOT NULL`: `SET NULL` ali nem seria possível |

**O backstop de tenant aqui é mais forte que duas verificações.** As duas FKs
compostas usam o **mesmo `organization_id` da linha do vínculo** — não são duas
conferências que alguém pode esquecer de casar. Precisou de
**`UNIQUE (id, organization_id)`** em `events`, mesmo desenho da 006 e da 021.

**`GET /api/events` devolve `responsibles` junto com o evento, de propósito:** o
calendário desenha um mês inteiro, e uma requisição por evento seria exatamente
a doença que a rota de foto do WhatsApp existe para evitar.

### Migration 023 e os SETE usos de LEITURA

**Consertar só a escrita teria fechado metade do problema.** Sete consultas
ainda contavam em UTC: o painel (visitantes do mês, aniversariantes do mês, a
lista deles e os próximos eventos), o "novos este mês" de `members`, e a janela
de 14 dias da aba **Recentes**.

**Efeito visível:** nas últimas horas do dia 30 ou 31, **o painel trocava de
mês**.

**Preservado de propósito, para ninguém "corrigir" depois:** a janela de
Recentes continua **14 dias** — mês corrente faria a aba **zerar no dia 1º** —, e
"novos este mês" continua sendo **admissão no mês corrente**, e **não** a marca
`is_new`, que já foi aposentada por dizer outra coisa.

#### Duas armadilhas que valem por si

**a. `data::date AT TIME ZONE zona` NÃO dá a meia-noite naquele fuso.** O
Postgres casta a data para `timestamptz` **pelo fuso da SESSÃO** e só então
converte — devolvendo **três horas antes**. O painel passaria a mostrar como
"próximo" um evento de **ontem à noite**: um defeito **mais sutil que o
original**, e que teria passado por conserto. A forma correta é
**`(data::date)::timestamp AT TIME ZONE zona`**.

**b. O array de bind era COMPARTILHADO pelas quatro consultas do painel**, e
funcionava enquanto todas usavam só `$1`. No instante em que uma passou a usar
`$2` e `$3`, as outras três dariam **500** — e **nem `typecheck` nem `build`
veem**, porque para o TypeScript é um `unknown[]` legítimo dos dois lados. Hoje
cada consulta tem o seu.

> ### Teste que não testa nada passa igual a teste que passa
>
> **É a lição mais transferível do dia.** A verificação que deveria pegar o item
> (b) casava as consultas **por um nome recém-renomeado**: achou **ZERO**
> consultas e imprimiu **"todas rodam"**. Verde por vacuidade.
>
> O conserto não foi ajustar o nome — foi fazer a verificação **falhar se não
> achar exatamente 4**. Toda checagem que varre um conjunto precisa afirmar o
> **tamanho** do conjunto, senão o dia em que ela deixar de achar as coisas é
> exatamente o dia em que ela para de avisar.

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
>
> **A 023 mostrou a versão forte disso em 07/09/2026:** ali não bastou a ordem
> dos **commits**, foi preciso ordem dos **DEPLOYS** — código num, migration em
> outro. Ver "A regra das DUAS ETAPAS". Quem apertar uma coluna daqui para a
> frente lê as duas: esta diz *em que ordem escrever*, aquela diz *em que ordem
> publicar*.

## Planos comerciais

Oficiais desde 06/09/2026.

| Plano | Preço | Membros | Usuários |
| --- | --- | --- | --- |
| **Semente** | grátis | até 100 | **2** |
| **Comunidade** | R$ 89/mês | ilimitados | até 10 |
| **Rede** | sob consulta | ilimitados, várias congregações | ilimitados |

O cadastro continua nascendo no plano **`avaliacao`**, 14 dias grátis.

Os três estão cadastrados na tabela `plans` desde a migration **007**, com os
limites como **dado do plano**, não como regra espalhada pelo código — é neles
que o checkout do Mercado Pago vai se ancorar.

Em `price_cents`, **`NULL` é "sob consulta" e `0` é gratuito de verdade**. A
coluna virou anulável na 007 exatamente por isso: sem a distinção, a Rede
ficaria indistinguível da Semente no banco. `max_users` e `max_members` nulos
significam ilimitado.

> **Os limites são aplicados** desde `154cacc`. Medido em 06/09/2026:
> `lib/plan-limits.ts` é consultado por **8 rotas** — `members`, `users`,
> `users/[id]`, `visitors/[id]/convert`, `auth/session` e as três de `billing`.
> A verificação é `uso >= teto` **na criação**: quem já passou não perde nada, a
> organização só não cresce.

## Plano efetivo — derivado na leitura

**Implementado** em `lib/plan-limits.ts` (`resolveEffectivePlan`) e na migration
**008**, integrado em `154cacc`.

O plano que vale a cada momento é **calculado na leitura**, nesta ordem:

1. assinatura paga vigente (`active` ou `past_due`) → o plano dela;
2. senão, avaliação ainda dentro do prazo → o plano da avaliação;
3. senão, `semente` — gratuito, sem expirar.

> **A linha em `subscriptions` é o contrato; o plano efetivo é o que vale
> agora.** O contrato guarda o que foi assinado, quando vence e o id no
> gateway. Uma avaliação vencida continua com `status = 'trialing'` no banco, e
> está certo que continue — quem ignora isso é `resolveEffectivePlan`, o único
> lugar que precisa saber a diferença. Não "conserte" o status no banco.

> **Por que derivado e não gravado por tarefa agendada.** A alternativa era um
> job que virasse o plano no vencimento, e foi descartada: não há cron, não há
> deploy, e a máquina é local — pode estar desligada exatamente quando o prazo
> virar. O backend provou a propriedade, não só o retorno: adiantou o
> `trial_ends_at` para ontem, confirmou que a linha seguia `trialing` porque
> ninguém rodou nada, e mostrou a API já devolvendo `semente` com teto 100.
> **Reabrir se** entrar tarefa agendada no projeto — mas o problema que a
> decisão resolve não é "falta de cron", é "estado que depende de alguém ter
> rodado algo".

> **O bypass mexe na regra 1.** Com ele ligado, "assinatura paga vigente vence
> tudo" passa a valer **sem que nenhum pagamento tenha existido** — a assinatura
> nasce `active`. A regra não muda; o que muda é como se chega nela. Ver
> "Cobrança".

### Mudança de comportamento — falhar fechado (06/09/2026)

**É o oposto do que valia antes.** Organização sem assinatura vigente não tinha
teto nenhum; agora cai para o `semente`, com teto de 100 membros. O motivo cabe
em uma frase: **não existe ilimitado por acidente.**

**Cair para o Semente não tira nada de ninguém.** Quem já passou dos 100 não
perde acesso e não tem nada apagado — a verificação é `uso >= teto` **na
criação**, então a organização só não cresce. O papel não interfere: teto é
comercial, não é permissão.

## Cobrança

### Bypass de contratação (06/09/2026) — decidido, em implementação

A igreja escolhe o plano, clica, e **a assinatura passa a valer na hora**: sem
gateway, sem QR, sem webhook e sem credencial. O motivo era direto: em
06/09/2026 o produto rodava local, não havia URL pública para receber webhook, e
o que se queria era ver o fluxo funcionando ponta a ponta. **A URL pública
existe desde 07/09/2026** — o que falta agora para o pagamento real é
credencial e decisão, não hospedagem. Ver "Mercado Pago".

**É atalho de desenvolvimento, não é produto.** Nada aqui substitui a
integração de pagamento; ele existe para destravar o fluxo enquanto não há
pagamento real. **Desde 07/09/2026 há hospedagem** — o que ele destrava passou a
ser o desenvolvimento, e nada mais: em produção ele é recusado pelo código.

> ### ⚠ O bypass é uma porta dos fundos de faturamento
>
> O que está sendo construído é, literalmente, **"clicar e ganhar o plano
> pago"**. Rodando local é inofensivo. No dia em que existir hospedagem,
> qualquer pessoa se promoveria para o Comunidade sozinha.
>
> **Esse dia chegou em 07/09/2026, e o guarda-corpo é o que está entre as duas
> frases.** Duas coisas seguram a porta hoje, e é bom que sejam duas: o código
> **recusa o bypass sempre que `NODE_ENV=production`**, ligada a variável ou não
> (`lib/billing-bypass.ts`), e a `BILLING_BYPASS` **não foi gravada nas envs de
> produção**, deixada de fora de propósito — registrado em
> `/home/lucas/claude.md`. Nenhuma das duas é dispensável por causa da outra:
> a segunda é configuração, e configuração muda com um clique no painel.
>
> Por isso ele nasce com guarda-corpo, e **nenhum destes itens é opcional**:
>
> - atrás de variável de ambiente explícita, **desligada por padrão** — sem ela
>   a rota **não existe**;
> - **recusa em produção ainda que `BILLING_BYPASS` esteja ligada** — e grita no
>   log. Variável que pode ser ligada num ambiente hospedado continua sendo a
>   porta dos fundos, a um `export` de distância. É mais estrito do que o pedido
>   original, e testado com build de produção real;
> - nome que denuncia o que faz: **`BILLING_BYPASS`**;
> - toda assinatura criada assim marcada na origem (`provider = 'bypass'`) e com
>   `billing_event`, para **nunca** ser confundida com pagamento recebido por
>   quem ler o banco depois.
>
>
> *Estes quatro itens têm uma cópia deliberada na tabela de Pendências, marcada
> como SEGURANÇA — públicos diferentes chegam por caminhos diferentes. As duas
> mudam juntas.*
>
> Ele também **não cria nenhuma linha em `subscription_payments`** — não houve
> pagamento, e o registro não vai fingir que houve.
>
> **Relaxar a recusa em produção é uma linha de código, e é decisão do Lucas.**
> Fica escrito para não parecer impossível no dia em que for preciso demonstrar
> o produto num ambiente hospedado — mas é decisão dele, não conveniência de
> quem estiver implementando.

> **Não ligar em ambiente exposto.** O bypass só sai de cena quando existir
> pagamento real — enquanto isso, ele é a única forma de contratar, e essa é
> exatamente a razão do cuidado.

A assinatura nasce **`active` direto, sem passar por `trialing`**: o pedido foi
"como se eu clicasse e já adquirisse", e passar pela avaliação atrasaria em 14
dias justamente o efeito que se quer ver.

> **`provider = 'bypass'` e o `billing_event` não são detalhe de registro: são a
> única coisa que distingue, no banco, uma assinatura paga de uma assinatura
> dada.** O `status` não carrega essa diferença — uma assinatura de bypass é
> `active` igual a uma paga. Quem for ler faturamento um dia depende dessa
> marcação, e ela é a razão de o guarda-corpo incluir os dois.

### Mercado Pago — decisão **suspensa**, não revogada (06/09/2026)

A integração real está **suspensa** enquanto não houver hospedagem. A análise
abaixo **continua valendo como a decisão de _como_ integrar** quando o pagamento
real entrar — ela não é lixo, e é o que impede alguém de escolher `preapproval`
por engano sem saber que ele não aceita Pix.

Quando retomar, a integração usa a **API de Pagamentos** (`POST /v1/payments`),
em Checkout Transparente. As duas alternativas foram descartadas por motivo
concreto:

| Alternativa | Por que não |
| --- | --- |
| `preapproval` (assinatura recorrente do MP) | **Não aceita Pix nem boleto** — cobra automaticamente em cartão, e não existe débito automático de Pix. Como Pix e boleto com CPF foi o requisito que **escolheu** o gateway, adotar recorrência seria contratar justamente a limitação que se queria evitar |
| Checkout Pro | O QR e o copia-e-cola precisam aparecer **dentro do nonia**. O `payload jsonb` de `subscription_payments` foi modelado para isso |

> **Consequência que vai surpreender alguém: com Pix e boleto, mensalidade é uma
> cobrança nova a cada ciclo, não automática.** É limitação do meio de
> pagamento, não do desenho — nenhum arranjo de código faz Pix debitar sozinho.

**Retomar quando** houver hospedagem com URL pública, que é o que falta para o
webhook existir. **Reabrir a escolha de API** só se cartão virar meio de
pagamento aceito: aí `preapproval` passa a fazer sentido, e
`subscriptions.provider_subscription_id` já está reservado para ele.

> **A condição de retomar disparou em 07/09/2026.** Existe hospedagem com URL
> pública: `https://nonia.lucascriado.com` recebe webhook. Isto está escrito
> aqui porque condição de retomada que ninguém confere é o mesmo que decisão
> esquecida — foi para isso que ela foi escrita junto da decisão.
>
> **Disparar a condição não é a ordem de retomar.** Retomar exige credencial do
> Mercado Pago e é decisão do Lucas; o que mudou é que o impedimento técnico
> acabou, e a análise de _como_ integrar (API de Pagamentos, não `preapproval`)
> continua valendo tal como está.

### O que não muda

Somente leitura com 7 dias de carência, a máquina de estados da assinatura, as
colunas `provider*` e o `payload jsonb` seguem como estão.

> O desenho agnóstico ao gateway **acabou de provar o próprio valor**: trocamos
> gateway real por bypass sem tocar em uma linha do domínio. É a justificativa
> daquela decisão sendo paga na prática, e o argumento para mantê-la quando o
> pagamento real chegar.

## Assinatura e acesso

`lib/subscription-state.ts` é o **único** lugar onde os estados da assinatura,
as transições permitidas e a carência existem — nada de `if (status ===
"past_due")` espalhado por rota. Dois conceitos que não se misturam:

| | |
| --- | --- |
| **Estado da assinatura** | o que está contratado (`subscriptions.status`) |
| **Nível de acesso** | o que a igreja pode fazer **agora** — `full`, `grace` ou `read_only` — derivado do estado mais a data, calculado na leitura, como o plano efetivo |

Vencida a mensalidade, começam **7 dias de carência** (`GRACE_DAYS`); depois
disso o acesso vira `read_only`. **Não pagar nunca tranca a igreja para fora dos
próprios dados**: consultar, buscar e exportar continuam valendo no pior estado.

> **Somente leitura vem de dívida, não de ausência de plano pago.** Cancelar
> leva ao gratuito, com o teto do gratuito; atrasar leva a somente leitura. Sem
> essa distinção, cancelar seria melhor que atrasar, e o somente leitura seria
> contornável em um clique.

Sem data de vencimento a igreja fica na carência e **nunca** é trancada por
falta de dado nosso — falha para o lado de quem usa.

### Avisos de cobrança

Faixa em **toda tela do app**, não só em Configurações: avisar alguém de que vai
perder acesso não pode depender de a pessoa visitar uma tela específica.

Aparece **só quando há o que fazer**, em ordem de gravidade: somente leitura,
carência com os dias restantes, avaliação vencida, avaliação terminando em 5
dias ou menos, teto perto ou estourado.

> **O "só quando há o que fazer" é o desenho, não economia de tela.** Aviso
> diário de "faltam 14 dias" vira ruído e deixa de ser lido — que é o oposto do
> que a carência precisa fazer. Com isso a carência de 7 dias finalmente serve
> para alguma coisa: ela existia para avisar antes de cortar, e o aviso não
> chegava.

O texto de somente leitura diz **o que continua funcionando** — consultar,
buscar, exportar —, não só o que parou. É a diferença entre a conta parecer
bloqueada e estar limitada.

## A exceção que resolve o impasse

A guarda de somente leitura barrava **contratar e cancelar** — as duas ações que
tirariam a igreja da inadimplência. Nas palavras do backend: *a guarda ficou boa
demais, pegou até o antídoto.* A igreja virava somente leitura por causa da
cobrança, e o produto não oferecia saída.

A exceção é `requireBillingWriteEvenWhenReadOnly()`, em `lib/auth.ts`, usada em
exatamente duas rotas: `POST /api/billing/subscribe` e `POST /api/billing/cancel`.

> **Ela não recebe parâmetro nenhum, e isso é o desenho.** Com a permissão fixa,
> não dá para "acrescentar uma rota" à exceção sem escrever código novo e pensar
> de novo. Foi decisão de não criar mecanismo genérico: lista de isenção cresce
> sozinha, função nomeada não.

> **Pendência que mora nesse ponto:** com cobrança de verdade, isentar o
> **cancelar** vira saída para a dívida — cancelar devolveria a escrita no plano
> gratuito e apagaria a inadimplência. A regra "cancelar assinatura vencida não
> limpa a dívida" tem que ser aplicada ali. Hoje não é explorável porque nenhum
> dinheiro troca de mãos.

## E-mail de convite

Existe, via Resend, e **o convite não depende dele**. Verificado contra a API
real, não deduzido: com o domínio não verificado, o convite é criado (201),
`emailSent` volta `false`, a `inviteUrl` continua vindo e o convidado aceita
normalmente pelo link. O Resend recusa com *"you can only send testing emails to
your own email address"*.

**Sem domínio verificado o produto não regride** — fica idêntico ao que era
antes de existir e-mail.

> **O envio está construído, testado contra a API real, e desligado por falta de
> domínio verificado.** O convite por link continua funcionando e é por ele que
> a equipe entra.
>
> **A premissa desta seção caiu em 07/09/2026.** Ela dizia que o envio "dorme
> até o projeto ter domínio, se um dia tiver" — o projeto tem domínio. Isso
> **não** significa que o e-mail passou a funcionar: verificar remetente no
> Resend depende de três registros DNS, e **ninguém mediu se eles foram criados
> ou se vale criá-los sob `lucascriado.com`**. O que mudou é que deixou de ser
> impossível e virou decisão do Lucas. Não escreva que funciona sem medir.

Se o assunto voltar, para o envio funcionar faltam três registros DNS: **MX** em
`send`, **TXT de SPF** em `send` e **TXT de DKIM** em `resend._domainkey`.

> **No Cloudflare eles precisam ficar como DNS only, com o proxy DESLIGADO.**
> Com a nuvem laranja a verificação falha — é o erro clássico de quem usa
> Cloudflare. O Resend recomenda subdomínio em vez do domínio raiz. **Verificar
> não exige hospedar nada** — nunca exigiu, e hoje há hospedagem de qualquer
> forma. Sob qual zona verificar (`nonia.app`, parada, ou `lucascriado.com`, que
> é onde a produção está) é parte da decisão.

## Convite pendente ocupa assento

Medido pelo frontend sem querer: 2 usuários mais 3 convites deram **5 de 5**, e
a tela mostrou "acessos esgotados" com dois nomes na lista.

**Não existe rota de revogar convite**, então um e-mail digitado errado consome
um assento **para sempre**. Numa igreja no Comunidade são 10 assentos; três
enganos custam 30% do que ela paga. Está sendo feito.

E isso agrava o caso abaixo: no Semente há 1 acesso, o dono já o ocupa, e um
convite pendente jamais caberia.

## Assentos do Semente — resolvido pela 012

O Semente dava **1 assento**, e o dono já o ocupava: no gratuito **ninguém
conseguia convidar a secretaria**. O teto não estava limitando o crescimento,
estava impedindo o uso.

**A migration 012 subiu para 2**, por decisão do Lucas em 06/09/2026 — o
gratuito passa a comportar o par que faz o sistema funcionar: quem lidera e quem
digita. A `description` do plano mudou junto, porque ela vem do banco.

## Multi-congregação

**Entrou no escopo em 06/09/2026.** O plano Rede vendia "várias congregações no
mesmo painel", isso não existia na interface, e a decisão do Lucas foi
**construir em vez de tirar a copy**. Manutenção do assunto na nota
`multi-congregacao` da canvas.

O que existe:

| | |
| --- | --- |
| `POST /api/organizations` | cria uma segunda igreja para quem já está logado |
| `GET /api/organizations` | lista as igrejas da pessoa, com o papel em cada uma |
| `POST /api/auth/switch` | troca a igreja ativa |

O caminho por convite **já funcionava** e foi medido: pessoa com conta aceita
convite de outra igreja e fica com duas organizações, papéis diferentes,
isolamento intacto. **Isolamento reverificado** com a mesma pessoa dona de duas
igrejas: cada uma só vê os próprios dados, e a gravação cruzada continua
recusada pelo banco com **23503**. Criar segunda igreja não abriu caminho nenhum.

> Não confunda `/api/organization` (singular — a igreja **atual** da sessão) com
> `/api/organizations` (plural — a **coleção** de igrejas da pessoa). São
> recursos diferentes de propósito.

### Decisões

| Decisão | Motivo |
| --- | --- |
| Segunda igreja em diante nasce no **Semente, sem avaliação** | a avaliação existe para a igreja **experimentar** o produto; quem já tem uma aqui já experimentou, e a segunda é **expansão**. Fecha a avaliação infinita sem precisar de contador — e quem planta congregação nova é o público do **Rede**: dar avaliação infinita a esse perfil é dar de graça o caso de uso que se quer vender |
| Nasce com **zero linhas em `subscriptions`**, não com uma assinatura `active` de preço zero | inventar assinatura ativa num plano gratuito diria **no banco** que alguém pagou. Mesma disciplina do `provider = 'bypass'`: o banco não afirma pagamento que não houve |
| **Criar troca a sessão** para a igreja nova | quem acabou de criar vai configurar, **toda configuração é escrita**, e escrita vai para a organização da sessão. Ficando na antiga, cada cadastro entra certinho **na igreja errada**, sem erro nenhum. **Surpresa se resolve avisando; gravação silenciosa no lugar errado, não** |

> **Consolidação financeira da rede continua sendo promessa**, mesmo com o
> seletor pronto. Consolidar é somar dados de **várias** igrejas numa visão só, e
> tudo hoje — sessão, filtro, FK — é de **uma** organização por vez. Não é
> adaptação do seletor, é desenho próprio. **Chame o backend antes:** é o tipo de
> coisa em que a pressa custa a garantia mais forte do produto.

## Marca que nunca expira

Uma doença com nome, encontrada três vezes: **valor gravado na criação que
alguém depois lê como se fosse atual.**

| Marca | O que dizia | O que era lido como |
| --- | --- | --- |
| `is_new` | "cadastrado alguma vez" | "novos este mês" — 7 contra 1 no banco de dev, com o mais antigo de 2022 |
| `is_recent` | nunca era limpo | a aba "Recentes" viraria uma segunda "Todos" com o uso |

Os dois passaram a **derivar da data**. O `is_recent` estava escondido atrás da
semente, que gravou 4 de 12 com data coerente — **o pior lugar para um defeito
estar**, porque o dado de demonstração o mascara.

**A janela de "Recentes" é 14 dias.** A própria semente já trazia essa fronteira
embutida (recente até 13, não-recente a partir de 20), são **dois domingos**, e
as alternativas caem por si: "mês corrente" faz a aba **zerar no dia 1º**, e
"desde o último domingo" muda o tamanho da janela todo dia.

**As colunas ficam, sem migration.** Depois de saírem da tela, do CSV e do JSON
viraram órfãs **invisíveis** — mesmo critério da `timezone`: órfã que promete
sai, órfã invisível fica.

> **Campo em resposta de API é promessa igual a coluna em CSV; a diferença é só
> quem lê.**

A varredura atrás de uma quarta não achou nada — e foi além dos booleanos,
porque a doença não é do tipo.

## O princípio por trás das decisões de acesso

Cinco decisões separadas, tomadas em momentos diferentes, com o mesmo princípio
por baixo — **o produto nunca usa o dado da igreja como refém. A cobrança limita
o que se cria; nunca o que já é seu.**

| Decisão | O que ela recusa |
| --- | --- |
| Somente leitura em vez de bloqueio | trancar a igreja para fora do próprio cadastro |
| Somente leitura vem de **dívida**, não de ausência de plano pago | punir quem simplesmente não assinou |
| Sem data de vencimento, a igreja fica na carência | punir por falta de dado **nosso** |
| Exportar continua no pior estado | transformar limitação em sequestro de dado |
| O perfil da pessoa fica fora da guarda de somente leitura | fazer a inadimplência da igreja alcançar o nome e a foto de alguém |

O nome e a foto de uma pessoa são dela, não da igreja. Os **dados da igreja**,
esses passam pela guarda.

Quem for decidir o próximo caso de cobrança: a pergunta é se a regra limita
criação ou se ela alcança algo que já pertence a quem usa.

## Recuperação de senha — desenho decidido (06/09/2026)

**Nada implementado.** Depende de e-mail transacional, que depende de remetente
verificado no Resend — e isso depende de registros DNS que **ninguém mediu se
existem**. O impedimento que estava escrito aqui era "quando o DNS existir": em
07/09/2026 o projeto ganhou domínio, então o impedimento deixou de ser
"não há domínio" e passou a ser "ninguém verificou o remetente". Ver
"E-mail de convite"; o desenho abaixo continua valendo inteiro.

**Tabela própria, `password_resets`, e não reuso de `invitations`.** O motivo é
de segurança, não de organização:

- `invitations` tem `organization_id` e `role_id` **NOT NULL**, e um reset é
  sobre a **identidade** — quem acessa duas igrejas não tem "a" organização, e
  reusar obrigaria a inventar valores;
- um bug no fluxo de convite **não pode virar concessão de acesso a uma igreja**.
  Tabelas separadas tornam isso impossível **por construção, não por cuidado**.

| Regra | |
| --- | --- |
| Validade | **1 hora** |
| Uso | único; pedir um novo invalida os anteriores; usar invalida todos |
| Efeito | trocar a senha revoga todas as sessões |
| Resposta do pedido | **200 exista o e-mail ou não**, pela mesma regra de não-enumeração do login |

> **Por que 1 hora e não um dia:** o link chega por e-mail, que é canal durável,
> encaminhável e sincronizado em outros aparelhos. Janela longa amplia o estrago
> se a caixa for comprometida **depois**.

## Lacunas conhecidas do MVP

Decididas, não esquecidas. Não "conserte" sem falar com o Lucas.

### Senha: o que entrou e o que continua de fora (06/09/2026)

**Trocar a própria senha ENTROU no escopo e já existe.** Decisão do Lucas:
ninguém conseguia trocar a própria senha, nem o dono do sistema, então quem
desconfiasse que a senha vazou não tinha o que fazer — e isso não custa e-mail
nenhum. `POST /api/auth/password` pede **senha atual e senha nova**, tem a mesma
trava de tentativas do login, revoga todas as sessões e emite uma nova (ninguém
é deslogado). Entregue na branch de auth.

> **Troca com senha atual e `self_password_reset` são coisas diferentes, e as
> duas continuam certas.** O `403 self_password_reset` do
> `PATCH /api/users/[id]` bloqueia **redefinição sem confirmação** da própria
> senha; `POST /api/auth/password` é **troca com confirmação**. O que separa as
> duas é a senha atual — sem ela, a troca viraria "quem pegou uma sessão aberta
> troca a senha e toma a conta". Quem "unificar" as duas abre esse buraco.

Continuam como lacunas conhecidas:

**1. Não existe recuperação de senha por e-mail.** Exige e-mail transacional
com **remetente verificado**, que não existe. Até 06/09/2026 o obstáculo era não
haver domínio nenhum; **desde 07/09/2026 há domínio**, e o obstáculo passou a ser
só a verificação — mais barato que antes, e ainda assim não feito. O caminho
`/recuperar-senha` aparece em `GUEST_ONLY_PAGES` do `proxy.ts` sem página
correspondente: é resíduo, não promessa.

**2. Quem acessa duas igrejas e ESQUECE a senha continua sem saída.** A nuance
importa: quem ainda lembra da senha troca por `POST /api/auth/password` — que
funciona justamente em multi-organização, porque a pessoa provou saber a senha.
Quem esqueceu, não — não há recuperação por e-mail, e o socorro pelo
`PATCH /api/users/[id]` recusa esse caso com **403
`user_in_multiple_organizations`**, porque a senha é da identidade, não do
vínculo, e um `owner` de uma igreja não pode mexer na credencial que dá acesso a
outra. É consequência conhecida, não bug, e a primeira coisa a reabrir se
aparecer um usuário multi-igreja de verdade.

## Mudanças de escopo e decisões revertidas

Nada aqui foi esquecido nem apagado: foi feito, estava certo para o contexto de
então, e o contexto mudou. Está escrito para que ninguém refaça achando que
faltou.

### "Ninguém dá push" — a REGRA é a mesma; o MOTIVO já mudou duas vezes

A proibição nasceu de um motivo específico: push na `main` disparava deploy em
produção pelo GitHub App. Em **06/09/2026** a aplicação do Coolify foi excluída,
esse gatilho sumiu e o risco se inverteu — o trabalho todo passou a viver numa
máquina só. Push **na própria branch** virou obrigação, não permissão.

**Em 07/09/2026 a produção voltou.** O texto anterior desta seção dizia que "o
gatilho não existe mais" porque a aplicação tinha sido excluída — **isso deixou
de ser verdade**, e é o tipo de frase que faz alguém relaxar a regra achando que
o risco sumiu junto com o motivo. O que segura o gatilho hoje é outra coisa:

- o **auto-deploy está desligado**, de propósito, porque **todo deploy roda as
  migrations**;
- **quem manda deployar é o gerente**, à mão.

A regra, portanto, continua idêntica — **push na sua branch sempre, `main` só o
gerente** —, mas agora ela protege produção de novo, e não apenas a árvore de
integração. Quem um dia ligar o auto-deploy está mexendo na única coisa que
separa um push de uma migration em produção.

### ~~Hospedagem, domínio e deploy — fora de escopo em 06/09/2026~~ — REVERTIDA em 07/09/2026

**Decisão de 06/09/2026:** rodar localmente, sem domínio nem DNS, e excluir a
aplicação criada no Coolify. **Revertida pelo Lucas em 07/09/2026:** há produção
no ar — ver "Produção".

As duas datas ficam porque a seção era **instrução**, e a instrução mudou de
sinal. Quem só ler o título antigo faz o contrário do que vale hoje.

| O que aquela decisão dizia | O que vale em 07/09/2026 |
| --- | --- |
| "Aplicação `nonia` no Coolify: descartada. O uuid dela é histórico — **não recrie a aplicação**" | **Instrução vencida.** Uma aplicação nova foi criada em 07/09/2026, no projeto `nonia.app`, e está publicada. A de 06/09/2026 continua excluída e o uuid dela continua histórico: **são duas aplicações diferentes**, e confundi-las manda trabalho para um recurso que não existe |
| "Plano de DNS/Cloudflare para `nonia.app`: dispensado" | **Parcialmente vencido.** A produção subiu em **subdomínio de `lucascriado.com`**, que não precisou de DNS novo nem de certificado novo. Para **`nonia.app`** o plano segue dispensado e o levantamento em `/home/lucas/www/FASE0-INFRA.md` continua correto |
| "`www.nonia.app`: nunca existiu registro" | Continua verdade |
| "Env `APP_URL`: **saiu da lista**. Só servia para montar link de convite com domínio público" | **Instrução vencida, pelo próprio motivo dela.** O domínio público existe, e a variável está gravada em produção. Voltou à lista — ver "Variáveis de ambiente" |
| "Não deployar enquanto as rotas estiverem abertas" | **Vencido em 07/09/2026**, e conferido, não presumido: 46 das 49 rotas de API têm guarda (`requirePermission`, `requireSession` ou `requireRole`), e as três sem guarda — `health`, `auth/invite`, `auth/logout` — são abertas de propósito; as páginas de `(app)` devolvem 307 para `/entrar`. Medido em produção: `/painel` 307, `/api/members` 401 |

O `Dockerfile`, o `docker-compose.yml` e o `HEALTHCHECK` em `/api/health`
continuam no repositório. **Deixaram de ser plano:** é por esse caminho que a
produção roda — Coolify, build pack `dockerfile`, porta 3000 no container, e as
migrations rodando no boot. É justamente por rodarem no boot que o auto-deploy
fica desligado.

## Por que existe um banco compartilhado

Não é desenho: é contorno. Nesta máquina não foi possível instalar PostgreSQL —
o `sudo` pede uma senha que ninguém do time tem —, então o desenvolvimento
aponta para o `nonia_dev`, remoto, por túnel SSH.

**A limitação é desta máquina e não se transfere.** O repositório é
auto-suficiente: **23 migrations**, seed idempotente com login de demonstração, e
`db:migrate`, `db:seed:dev`, `db:status` e `auth:owner` prontos. Quem tem
administrador no próprio computador instala Postgres 15+, aponta a
`DATABASE_URL` para `localhost` e não precisa de SSH, de túnel, de credencial de
ninguém, nem de alguém para conceder e revogar acesso depois.

Banco por pessoa também é **melhor**: o dado de teste de um não atrapalha o
outro, e não existe o risco de apontar para o banco errado — que aconteceu duas
vezes em 06/09/2026.

> **O túnel não é compartilhável por construção.** Ele autentica com a
> credencial de administração do servidor, que também roda outros sistemas.
> Replicá-lo na máquina de outra pessoa seria entregar administração do
> servidor inteiro, e não há como conceder "só o banco" por esse caminho. Quem
> chega usa banco local — não é preferência, é a única forma segura.

## Infraestrutura — o que importa hoje

**São duas coisas desde 07/09/2026, não uma.**

- **Produção** — `https://nonia.lucascriado.com`, no Coolify, contra a base
  `postgres` do servidor. Deploy à mão, pelo gerente, com auto-deploy desligado.
- **Desenvolvimento** — cada dev roda o nonia na própria máquina contra o
  `nonia_dev`, alcançado pelo túnel SSH `nonia-db-tunnel.service` em
  `127.0.0.1:5432`.

O **`linger` deixou de ser a pendência de infra nº 1** em 07/09/2026. O
argumento que o colocava em primeiro lugar era que o túnel seria o **único**
caminho do time até dado — e não é mais, porque existe produção. Ele continua
sendo o único caminho até o `nonia_dev` e o `nonia_front`: sem ele o time para
de desenvolver, mas o produto não cai. Continua aberto, com outro peso.

O `Dockerfile` e o `docker-compose.yml` continuam subindo tudo localmente **e
agora são o caminho da produção** — ver "Mudanças de escopo".

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
| `APP_URL` | **voltou à lista em 07/09/2026**, e está setada em produção com `https://nonia.lucascriado.com`. `lib/invitations.ts` a usa para montar o link do convite; sem ela vale o host da requisição, que localmente é o que se quer e em produção seria o link errado |
| `PORT` | opcional, padrão 3000. A convenção do projeto em desenvolvimento é **3111** — ver "Estado do MVP" |
| `MIGRATE_CONNECT_ATTEMPTS` | opcional, tentativas de conexão do `migrate.mjs` (padrão 15) |
| `BILLING_BYPASS` | liga o bypass de contratação. **Desligada por padrão; sem ela a rota não existe**, e é recusada em produção mesmo ligada. Nunca em ambiente exposto |

Todas são **runtime**. Nenhuma pode virar `NEXT_PUBLIC_*`. Nunca commite valores.

As credenciais do Mercado Pago (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`) saíram
desta lista em 06/09/2026: com a integração suspensa, não são necessárias.
Voltam quando o pagamento real voltar.

**`APP_URL` voltou em 07/09/2026, e o motivo pelo qual ela voltou é o mesmo
pelo qual tinha saído.** Ela saiu porque só servia para montar o link de convite
com um domínio público, e domínio público não existia. Existe: a variável está
gravada em produção com `https://nonia.lucascriado.com`. Em desenvolvimento
continua opcional — sem ela vale o host da requisição, que é o certo localmente.

## Listagens: paginação e filtro no servidor

As três listagens passaram a paginar e filtrar **no servidor**, no formato
`{ records, total, page, pageSize }` — o mesmo que `/api/activities` já usava,
**escolhido por ser o da casa, não por ser melhor**. O filtro roda **antes** de
paginar.

As duas metades vieram na mesma entrega de propósito: paginar no servidor
mantendo o filtro no cliente faria a busca olhar só a página visível.

> **Listagem e exportação tiram o filtro do mesmo lugar** (`lib/listings.ts`).
> Antes cada uma tinha o seu `WHERE`, espelhados à mão — e espelho à mão só é
> verdade enquanto ninguém mexe em um dos lados. "Exportar o que estou vendo"
> dependia de disciplina; agora é estrutural. É o mesmo gênero das promessas
> vazias que a gente vinha recusando.

**A exportação não pagina, de propósito:** o arquivo leva tudo o que casa com o
filtro.

### Download dos comprovantes

| Decisão | Motivo |
| --- | --- |
| Teto de **500 comprovantes**, expresso em **quantidade** e não em bytes, com `413` mandando filtrar por mês | a pessoa vê 501 lançamentos na tela e entende; "mais de 700 MB" não diz o que fazer. **Limite que se entende ganha de promessa que às vezes quebra** — mesmo princípio do guarda-corpo do bypass |
| Nome de arquivo em **ISO** (`2026-09-06 - Entrada - Descrição.pdf`) | **decidido pelo teste, contra a preferência inicial**: no formato brasileiro, que casa melhor com a coluna do CSV, a pasta não ordena cronologicamente — 15 de agosto aparecia depois de 1º de setembro. Só aparece abrindo a pasta com meses diferentes |
| **404 com mensagem**, não zip vazio | zip vazio que a pessoa abre e não entende é pior que uma recusa que diz o que fazer |

> **Quem escreve o formato não pode ser o único a validá-lo.** O zip foi escrito
> à mão e conferido com **três ferramentas externas**, não com o leitor do
> próprio autor.

## Listagens pesadas — próxima prioridade técnica

Medido pelo backend: as listagens trazem **tudo**, e trazem a foto em base64.

| Registros | Payload |
| --- | --- |
| 10 membros | 0,9 MB |
| 50 | 4,3 MB |
| 100 | 8,6 MB |
| 500 | ~43 MB |

Por carregamento. Na mesma base o painel devolve **1 KB** e o CSV **10 KB**.
`/visitantes` e `/financeiro` têm o mesmo desenho, e no financeiro o anexo chega
a 2 MB por lançamento.

> **Por que é a próxima e não uma entre outras:** é o único item que **piora
> sozinho com o tempo**, e o limite não é técnico, é comercial. A Semente
> esconde o problema atrás do teto de 100 registros; quem assina o Comunidade
> porque cresceu é exatamente quem encontra os 43 MB. **O cliente que paga é o
> que sofre.**

## Pendências

Datadas para que ninguém as leia como fato consumado.

| Pendência | Desde |
| --- | --- |
| **Quando houver cobrança real, cancelar assinatura vencida não pode limpar a dívida.** O ponto exato onde aplicar está marcado no docblock de `requireBillingWriteEvenWhenReadOnly`, em `lib/auth.ts` — a exceção que isenta o cancelar da guarda de somente leitura. Hoje não é explorável porque nenhum dinheiro troca de mãos | 06/09/2026 |
| **SEGURANÇA — o bypass de contratação não pode ser ligado em ambiente exposto.** Ele concede plano pago sem pagamento. Enquanto existir, precisa de `BILLING_BYPASS` desligada por padrão, **recusa em produção ainda que a variável esteja ligada**, e toda assinatura marcada com `provider = 'bypass'` mais `billing_event`. **Só sai de cena quando existir pagamento real.** *Cópia deliberada do bloco em "Cobrança" — públicos diferentes; as duas mudam juntas.* | 06/09/2026 |
| **Secretaria pode excluir lançamento financeiro.** A 009 concede `finance.write`, e o modelo não distingue criar de editar e apagar — as três rotas pedem a mesma permissão. Se excluir for demais, o caminho é uma permissão separada. Está com o Lucas | 06/09/2026 |
| **E-mail de convite não envia** enquanto o domínio não estiver verificado no Resend — faltam três registros DNS, e no Cloudflare com proxy desligado. O convite por link funciona | 06/09/2026 |
| **Exclusão lógica existe só no financeiro** (migration **011**: `deleted_at` e lixeira). Membros e visitantes continuam com exclusão definitiva. O enquadramento que resolveu o caso do financeiro vale para eles: a pergunta não é "quem pode apagar", é **"o que acontece quando se apaga"**. Está com o Lucas | 06/09/2026 |
| **Não há como revogar convite pendente**, e cada um ocupa um assento para sempre. Está sendo feito | 06/09/2026 |
| **Listagens pesadas** — ver a seção acima. Próxima prioridade técnica | 06/09/2026 |
| **`purgeStaleSessions()` existe em `lib/auth.ts` e ninguém chama** — a tabela `sessions` cresce para sempre. Levantado pelo próprio backend logo após remover as permissões órfãs, para não ficar com dois pesos | 06/09/2026 |
| **`PATCH /api/users/<id>` com id malformado devolve 500 em vez de 404.** Uuid válido inexistente devolve 404 certo; o malformado cai no catch genérico — mesmo gênero do JSON malformado | 06/09/2026 |
| **"Consolidação financeira da rede" é promessa não cumprida.** O seletor de igreja existe; consolidar dados de várias numa visão só não. Ver "Multi-congregação" | 06/09/2026 |
| **Sobrou um primo do UTC: `app/api/export/comprovantes/route.ts`.** É **só o nome do arquivo do zip** — nenhum dado gravado, nenhuma consulta. Fica registrado para não parecer esquecido; o resto fechou (ver "O nextSunday" e "Os três defaults") | 07/09/2026 |
| **Não existe editar evento.** Não há `PUT` nem `PATCH` em `/api/events`, e a tela do calendário não oferece edição em lugar nenhum: hoje um evento se **cria** e se **apaga**, e nada nele é editável. Apareceu ao construir os responsáveis, mas **não é lacuna dos responsáveis — é recurso ausente**. Não enfiamos um `PUT` de propósito: sem tela e sem permissão pensada, ele criaria **meia edição**, que é pior que a ausência porque parece pronta. Está com o Lucas | 07/09/2026 |
| **O histórico gravado errado nas noites anteriores não foi corrigido.** A 020 não toca em linha existente, de propósito: corrigir dado contábil já lançado é decisão do Lucas, não efeito colateral de migration. Está com ele decidir se há o que corrigir | 07/09/2026 |
| **`linger` do túnel de banco — continua aberta, e DEIXOU de ser a nº 1 em 07/09/2026.** Sem `loginctl enable-linger`, o `nonia-db-tunnel.service` cai quando o Lucas encerra a sessão. O que a colocava em primeiro lugar era o túnel ser o **único** caminho do time até dado; com produção no ar, ele deixou de ser. Continua sendo o único caminho até o `nonia_dev` e o `nonia_front`: sem ele **o time para de desenvolver, mas o produto não cai**. Detalhes com o admin de VPS, em `/home/lucas/claude.md` | 06/09, rebaixada em 07/09/2026 |
| **`.env.example` descreve um mundo que não existe mais — e desde 07/09/2026 pelo motivo oposto.** Ele diz que `APP_URL` é "opcional, e hoje sem uso" e que "não há hospedagem nem domínio no escopo atual". As duas frases eram verdade em 06/09 e são falsas agora: há domínio, e a variável **está gravada em produção**. O bloco do `BILLING_BYPASS` continua correto e é o melhor pedaço do arquivo. É arquivo do backend pela regra de propriedade, e está com ele | 06/09, revista em 07/09/2026 |
| **Formulário de membro oferece quatro ministérios que não existem.** `components/person-record-dialog.tsx:120` traz `["Nenhum", "Louvor", "Missões", "Acolhimento", "Infantil"]` fixos como estado inicial; a linha 189 só troca pela lista real da igreja **se a resposta for `ok`**, e o `catch` engole a falha. Medido em igreja com zero ministérios, com `/api/ministries` forçado a 403: o campo oferece os quatro. Quem escolher um é atendido em silêncio — `app/api/members/route.ts:90` resolve pelo nome dentro da organização, não acha e grava `ministry_id NULL`; o `POST` respondeu **201** e a listagem depois mostra "Nenhum". O campo ainda está marcado obrigatório. Frontend | 07/09/2026 |
| **Superusuário do Postgres em produção.** A aplicação de produção entra no cluster como `postgres`, e esse cluster também hospeda o `nonia_dev` e o `nonia_front` — escolha do Lucas em 07/09/2026, depois de recomendação em contrário. Migrar para role própria quando houver janela. Detalhes com o admin de VPS, em `/home/lucas/claude.md` | 07/09/2026 |

### Fechadas em 07/09/2026

Ficam registradas para que ninguém as reabra achando que continuam de pé, e
porque o motivo de cada uma ensina mais que o conserto.

| Pendência | O que fechou |
| --- | --- |
| **O sino de notificações não faz nada, e promete que faz** | O pontinho vermelho `has-dot` era **chumbado no código**, não vinha de dado: numa igreja criada havia cinco minutos, sem um único registro, ele estava lá. Agora o botão **abre um painel**, e o painel diz a verdade — estado vazio honesto. **Prometer é pior que faltar:** o sino sem `onClick` era o mesmo gênero do logout que era link morto, com o agravante de anunciar novidade inexistente |

---

# Convenções de código

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

## Documentação

`CLAUDE.md`, `README.md` e `database/README.md` têm dono único, e cada um tem
um assunto: estado, decisões e convenções de código; como começar; banco. Não
repita conteúdo entre eles — aponte.

**Quando duplicar for a escolha certa**, e às vezes é: o critério não é o
conteúdo, é o **público**. Duplica-se quando duas pessoas chegam por caminhos
diferentes e nenhuma passa pelo outro texto — quem vai implementar lê a seção,
quem faz varredura antes de expor o sistema lê a tabela de pendências. Duplicar
por preguiça de escolher onde vai é outra coisa.

**Teste antes de dar uma entrada por pronta: se a frase não termina em algo que
alguém faz, ela ainda não está pronta.** Descrever o que aconteceu é o que sobra
quando quem escreve parou na observação e não perguntou o que ela deveria mudar.

**Toda cópia deliberada aponta para a outra.** Uma linha em cada, dizendo onde
está a irmã e que as duas mudam juntas. Sem isso a duplicação é dívida com
prazo: alguém atualiza a que está lendo e nem descobre que a outra existe — foi
o que aconteceu com o guarda-corpo do bypass em 06/09/2026, que envelheceu de um
lado só na primeira vez que o conteúdo mudou.

## Segredos e interpolação

**Quem carrega segredo no ambiente nunca monta mensagem nem script por
interpolação.** Heredoc **sempre** com delimitador entre aspas simples
(`<<'FIM'`); variável que precisa entrar vai por ambiente ou codificada em
base64, nunca expandida no meio do texto.

O motivo é que **a regra de nunca colar credencial pode estar sendo cumprida na
intenção e violada pelo shell, sem ninguém ver.** São dois caminhos diferentes
para um segredo chegar a uma mensagem:

| Caminho | A regra "não cole credencial" pega? |
| --- | --- |
| Alguém cola o valor | **sim** — há um ato deliberado |
| O shell expande sem ninguém colar | **não** — não houve ato de colar |

Num heredoc **sem** aspas no delimitador, escrever o *nome* de uma variável de
credencial no corpo de um relatório faz o shell substituí-la pelo **valor real**,
e a credencial viaja dentro da mensagem. Ninguém colou senha nenhuma, e a senha
vai junto. Verificado em 06/09/2026 com uma canária, passando o mesmo texto
pelos dois caminhos: com aspas, tudo literal; sem aspas, o comando executou e a
variável expandiu.

### Duas defesas diferentes — só uma cobre o vazamento

Não as confunda; concluir que uma cobre a outra é pior que não ter lido nada,
porque a pessoa fica achando que está protegida.

| Defesa | Protege | Não protege |
| --- | --- | --- |
| Valor da variável ser só letras e números | o **conteúdo**, quando ele é interpolado dentro de um heredoc | nada do vazamento |
| **Heredoc com delimitador entre aspas simples** | o **conteúdo** e o **vazamento** | — |

No vazamento o problema não é o formato do valor: é o texto **mencionar o nome
da variável**. `$COOLIFY_API_TOKEN` escrito no corpo de um relatório expande
seja qual for o valor. **Só o delimitador entre aspas cobre esse caso.**

> **Vale para qualquer texto montado por interpolação, não só relatório — e o
> dano escala com o que aquele texto controla.** Scripts montados para rodar no
> servidor injetavam a senha do banco por heredoc sem aspas. Ali — e só ali — a
> senha ser alfanumérica salvou por **sorte parcial**: foi escolha feita
> pensando em URL, e por acaso também a protegeu do shell. Com uma crase ou um
> cifrão, o script montado errado teria rodado **contra um banco**, não contra
> um relatório.

**A varredura dos artefatos não achou nada a mudar** (06/09/2026): nenhum
heredoc sem aspas nos scripts que sobrevivem à sessão, o único existente já está
na forma correta, e a senha do túnel nunca é interpolada nem entra em linha de
comando — vem do ambiente por `SSH_ASKPASS`, então nem em `ps` aparece.

> **O perigo estava nos scripts avulsos, montados na hora e que somem com a
> sessão: no hábito, não em código instalado.** Arquivo nenhum conteria esse
> defeito — a regra contém. É por isso que isto é convenção e não conserto.

A mecânica e o caso de perda de informação estão em
"[Apurando fatos](#apurando-fatos)", na armadilha do relatório adulterado.

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
- **Componente compartilhado nasce com as regras no `globals.css`**, nunca numa
  folha de escopo como o `marketing.css`. **Onde a regra mora determina onde o
  componente funciona**: componente que pode ser usado em mais de um escopo
  precisa das regras no lugar que todos os escopos carregam.

  A regra vem de dois incidentes em 06/09/2026, o mesmo erro nos dois sentidos:
  o botão de mostrar senha ficou abaixo dos 44px porque a regra estava no
  `globals.css` e o `marketing.css` vencia por ordem de carregamento; e o
  `AuthField`, nascido para `/entrar` e `/cadastro`, teve o botão de mostrar
  senha caindo para fora do campo ao ser reusado dentro do app, porque as regras
  dele moravam no `marketing.css`. **Nenhum dos dois aparece em `typecheck` nem
  em `build` — só abrindo a tela.**
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
- `secretaria` tem `finance.write` desde a migration **009**. O modelo só tem
  `read` e `write`, sem distinguir criar de editar e apagar, então isso inclui
  **excluir lançamento** — as três rotas pedem a mesma permissão. Conceder só o
  lançar exigiria uma permissão nova.

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
- **Leia o corpo com `readJson` de `lib/http.ts`, nunca com `request.json()`
  cru.** O `request.json()` estoura em corpo malformado e cai no catch genérico,
  virando **500** — o cliente conclui que o servidor quebrou quando quem errou
  foi ele. O `readJson` devolve `400 invalid_json`. Em 06/09/2026 isso valia
  para **todas** as rotas de `app/api`.
- **Grave a atividade na mesma transação da escrita.** Numa segunda transação,
  se ela falhar o efeito já aconteceu, o chamador recebe 500, reenvia e leva um
  `409` — achando que não funcionou quando funcionou.
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

## WhatsApp

Módulo em `lib/whatsapp/` e `app/api/whatsapp/`, sobre o **OpenWA**. Migration
**013**.

| Método e rota | O que faz |
| --- | --- |
| `GET /api/whatsapp` | estado da conexão da organização |
| `DELETE /api/whatsapp` | desconecta |
| `POST /api/whatsapp/connect` | inicia a sessão |
| `GET /api/whatsapp/connect` | lê o QR do pareamento |
| `GET /api/whatsapp/broadcasts` | lista os envios |
| `POST /api/whatsapp/broadcasts` | cria um envio |
| `GET /api/whatsapp/broadcasts/[id]` | acompanha um envio — **e o faz andar**, ver abaixo |
| `POST /api/whatsapp/broadcasts/[id]` | age sobre um envio |

**Três permissões, não duas.** `whatsapp.read` e `whatsapp.write` vão para
`owner`, `admin` e `secretaria` — quem consulta cadastro consulta conversa, e a
secretaria é quem atende. **`whatsapp.broadcast` é separada e só para `owner` e
`admin`**: responder **uma** conversa e disparar para **quinhentas** não têm o
mesmo peso, e **mensagem enviada não volta** — não há lixeira para isso, como há
no financeiro desde a 011. Abrir para a secretaria depois é uma linha; recolher
um envio errado é impossível.

O envio tem categoria própria no histórico (`whatsapp`), e não `system`: é a
ação mais visível que a igreja toma, e é a que alguém vai procurar depois.

Estados: a conexão é `ready` quando conectada (`conectado()` em
`lib/whatsapp/connection.ts`); o envio vai por `pending`, `running`, `done`,
`canceled`, `failed`, e cada destinatário tem o seu — `pending`, `sent`,
`failed`, `skipped`.

### O envio anda na leitura, e pausa com a tela fechada

Não há tarefa agendada no projeto — mesma razão do plano efetivo e do nível de
acesso serem derivados. **Quem avança o envio é quem olha para ele:** a consulta
de acompanhamento fecha o lote terminado e começa o próximo.

> **Com a tela fechada, o envio pausa na virada do lote** e retoma quando alguém
> abrir de novo. **Não perde e não manda duas vezes**, porque cada destinatário
> tem status próprio e só sai de `pending` uma vez. 500 pessoas são 5 lotes de
> `LOTE_MAX = 100`.

### O intervalo entre mensagens é o freio — não mexa

`INTERVALO_MS = 3000` com jitter (`JITTER_MEDIO_MS = 1000`) é o que faz 500
pessoas levarem **~35 minutos**. **Não se mexe para acelerar, nem "só nesse
caso".** É ele que protege o número de ser banido. Uma saída que despachasse 5
lotes de uma vez foi vista e **descartada por isso**: multiplicaria a taxa por 5.

> **Não ligue o pacing do OpenWA e não replique a escala dele.** O
> `SEND_PACING_WARMUP_SCHEDULE` — 20/40/80/160/320/640/1000 mensagens por dia —
> vem **desligado por padrão** e conta **idade da sessão, não idade do número**.
> Ligado, um número com anos de uso seria tratado como recém-pareado e travaria
> em **20 no primeiro dia**: o limitador estaria *errado* sobre esse número, não
> cauteloso. **Decisão do Lucas em 06/09/2026: fica desligado**, e o número
> conectado é separado mas **tem histórico**.

O risco que sobra não é volume, é **denúncia e bloqueio de quem recebe** — e
isso se resolve com a mensagem ser reconhecível pela igreja, que é assunto de
tela, não de infraestrutura.

## Documentos: CPF e CNPJ

`lib/documents.ts` é o único lugar que valida documento.

> ### ⚠ CNPJ alfanumérico
>
> **Desde 31/07/2026 a Receita emite CNPJ com letras nas 12 primeiras
> posições** — só os 2 dígitos verificadores continuam numéricos. **O validador
> de módulo 11 numérico "de sempre", que é o que qualquer pessoa escreve de
> memória, recusa o CNPJ de qualquer empresa aberta de agosto de 2026 em
> diante.**
>
> A regra converte cada caractere pelo **código ASCII menos 48** (`'0'..'9'`
> viram 0..9, `'A'` vira 17, `'Z'` vira 42), e é **retrocompatível**: um CNPJ
> numérico antigo gera o mesmo dígito sob a regra nova. É uma validação só, não
> duas.
>
> **Por que isso é grave e não chato:** o erro seria silencioso do **nosso**
> lado — um 400 educado, nada nos logs, nenhum teste falhando — e caro do lado
> do **cliente**: a igreja recém-aberta lê que o documento dela é inválido e vai
> embora. A verificação passa, o texto fecha, e o que chega ao cliente está
> errado.

**A máscara da tela não pode aceitar só dígitos.** Se o campo recusar letras na
digitação, a validação correta do servidor não salva ninguém — a pessoa nem
consegue escrever o próprio CNPJ.

## Exportação em CSV

`lib/csv.ts` é o único lugar que monta CSV. **Quem abre estes arquivos é
secretaria de igreja, no Excel em português** — um CSV "tecnicamente correto"
abre lá como uma coluna só e com os acentos quebrados, e a pessoa conclui que o
sistema está com defeito.

| | Escolha | Por quê |
| --- | --- | --- |
| separador | **ponto e vírgula** | é o que o Excel pt-BR espera; com vírgula, tudo vira uma coluna só |
| codificação | **UTF-8 com BOM** | sem o BOM, "João" vira "JoÃ£o" |
| quebra de linha | **CRLF** | RFC 4180, e é o que o Excel prefere |
| datas | **dd/mm/aaaa** | |
| números | **vírgula decimal, sem separador de milhar** | o milhar atrapalha o Excel a reconhecer a célula como número |

Nada disso é descuido a corrigir para o padrão internacional. **São escolhas
deliberadas**; mudá-las quebra o único uso que existe.

### Injeção de fórmula — não remova a neutralização

Célula que começa com `=` `+` `-` `@` é **fórmula** no Excel. O dado vem de
formulário aberto: um membro cadastrado como `=1+1` vira conta na planilha, e
construções piores chamam programa externo na máquina de quem abre. **É
explorável por qualquer pessoa que consiga cadastrar um membro.**

Todo texto exportado passa por `texto()`, que põe um apóstrofo à frente nesses
casos — o apóstrofo marca a célula como texto e **não aparece** na planilha. A
guarda é `/^[=+\-@\t\r]/`, que cobre também tab e CR.

Efeito colateral aceito e documentado: telefone digitado como `+55 11…` também
ganha o apóstrofo, visível só em editor de texto. É o preço, e é barato.

Use `bruto()` só para valor que o **próprio sistema** gerou (data, número).

## Armadilhas conhecidas

- **Renomear `middleware.ts` para `proxy.ts` não basta: a função exportada
  também precisa se chamar `proxy`.** Só o arquivo renomeado faz o Next
  responder **500 em toda requisição**, com o log dizendo
  `The file "./proxy.ts" must export a function`. Quem fizer o rename lendo só o
  aviso de depreciação derruba a aplicação inteira.
- **`next build` sem `DATABASE_URL` falha** com "Failed to collect page data",
  porque `lib/db.ts` instancia o Sequelize no import do módulo. Por isso o
  `Dockerfile` injeta uma `DATABASE_URL` fictícia só na etapa de build —
  **aquela linha não é sobra; quem "limpar" quebra o build.** Para rodar
  `npm run build` na sua máquina, tenha a `DATABASE_URL` no `.env`: ela não
  precisa apontar para um banco que responde, só existir.

### Apurando fatos

Estas não são de código, são de método. São as que mais perto chegaram de entrar
na documentação como verdade, e as que custaram mais tempo no dia em que
apareceram.

- **Não trate o que aparece no terminal de outro agente como fato.** Aquela tela
  mostra também caixa de entrada não enviada, rascunho sendo redigido e saída
  parcial. `maestri check` serve para saber **se o outro está ocupado**, não
  para colher informação. Em 06/09/2026 uma frase afirmando que uma tarefa de
  infra tinha sido executada foi lida assim — era texto solto numa caixa de
  entrada, ninguém tinha dito aquilo, e a tarefa não tinha sido feita.
- **O outro lado da mesma regra: quem escreve não deixa isca.** Rascunho não
  enviado numa tela compartilhada é armadilha para quem lê, e a defesa mais
  barata é não deixá-lo lá — se não houver texto na tela, não há o que ler
  errado. Em 06/09/2026 a regra de cima estava escrita, clara, e falhou **três
  vezes**: não porque fosse fraca, mas porque texto que *parece* dirigido a você
  é gatilho forte demais. **As duas metades juntas é que cobrem** — quem lê não
  colhe fato, quem escreve não deixa isca —, do mesmo jeito que só as duas
  defesas juntas cobrem a interpolação de segredo.
- Quando precisar saber se algo aconteceu: **meça, ou pergunte a quem
  respondeu**. No caso acima a medição de uma linha
  (`loginctl show-user lucas --property=Linger`) devolveu o oposto do que a tela
  sugeria, e foi só por isso que o documento não registrou uma afirmação falsa.
- **Build passando não é prova de que o schema está aplicado.** `typecheck` e
  `build` não abrem conexão com o banco: passam iguais com a migration aplicada
  ou não. Em 06/09/2026 a `008` foi integrada na `main` sem ser rodada no
  `nonia_dev`, os dois comandos passaram, e `GET /api/auth/session` respondia
  **500** com `column p.max_members does not exist` — o código já consultava a
  coluna nova, o banco ainda tinha a antiga. Verificou-se a coisa errada e
  chamou-se de verificado. **Quem prova é `npm run db:status`**, que compara o
  disco com o aplicado, só lê, e sai com código 1 quando falta migration.
- **Rota dando 500 e falando de coluna que não existe: o primeiro palpite é
  migration não aplicada, não bug de código.** Custa um `SELECT` em
  `schema_migrations`.
- **Relatório com crase, cifrão ou aspas embutido na linha de comando chega
  adulterado.** Dentro de aspas duplas no bash, a crase é **substituição de
  comando**: o shell executa o que está entre elas e põe o resultado no lugar
  das palavras; `$` expande variável. Em 06/09/2026 duas palavras sumiram de um
  relatório desse jeito, **e a frase continuou parecendo uma frase** — dizendo
  outra coisa. É a mesma classe silenciosa e plausível da migration que não
  aplicou com o build passando: o texto não fica quebrado, fica diferente.

  **Como evitar:** escreva num arquivo com heredoc de delimitador **entre aspas
  simples**, que desliga toda substituição, e mande o arquivo.

  ```bash
  cat > /tmp/relatorio.txt <<'FIM'
  texto com `crase`, $cifrão e "aspas" à vontade
  FIM
  maestri ask "Claude Code" "$(cat /tmp/relatorio.txt)"
  ```

  O detalhe que faz funcionar são as aspas simples no delimitador: `<<'FIM'` não
  interpreta nada, `<<FIM` interpreta. Heredoc sem as aspas não resolve.

  **A mesma mecânica que come palavras injeta segredo**: sem as aspas, o nome de
  uma variável de credencial no corpo do texto expande para o valor real. Por
  isso isto também é convenção de segurança — ver "Segredos e interpolação".

  **E o hábito:** se uma frase que você mandou ficou estranha, assuma que foi
  isso antes de assumir distração.
- **Relatar o próprio erro é o que impede que ele vire verdade histórica.** Em
  06/09/2026 um rascunho **não enviado**, lido no terminal de outro agente, foi
  tratado como decisão do Lucas, virou commit na `main` e a mensagem dizia
  "Decisão do Lucas" — de uma decisão que ninguém tinha tomado. Foi revertido
  **porque quem errou relatou depois, sem ninguém ter percebido**. Sem o relato,
  a mudança teria ficado e o histórico atribuiria a decisão a quem não a tomou.
  A lição não é "não leia a tela", que já está acima: é que **o histórico é
  escrito por quem estava lá, e só quem errou sabe que houve erro**.

  **Não confunda com texto embaralhado**, que tem outra causa: mensagens de
  duas origens chegando entrelaçadas. Ali o pedaço **não some**, ele se mistura,
  e dá para reconstruir os dois lados. Na substituição a palavra desaparece e o
  resto continua parecendo íntegro — é essa a que engana.
- **Confira a fonte antes de implementar regra de documento, imposto, formato
  oficial ou prazo legal — o que você lembra pode ter mudado.** Conhecimento
  factual sobre regra externa envelhece **sem avisar, e sem parecer
  envelhecido**: a versão que você tem de memória continua coerente, completa e
  errada. O caso é o CNPJ alfanumérico (ver "Documentos"), onde escrever de
  memória teria recusado o documento de toda empresa aberta a partir de agosto
  de 2026.
- **Dado de teste inventado envelhece junto com a regra.** Duas suítes
  quebraram por usar um CNPJ inventado que a validação nova recusa — teste
  errado, código certo. Prefira exemplo que satisfaça a regra de verdade.
- **Revisar uma tabela não é o mesmo que percorrer o caminho com ela.** Uma
  configuração pode parecer sensata lida como lista e ser absurda em uso: a
  permissão da secretaria foi decidida no abstrato e parecia razoável na tabela
  de papéis; percorrer a jornada mostrou que ela cadastra tudo e leva 403 ao
  lançar o dízimo. Vale para qualquer conjunto de regras — permissão, validação,
  limite, roteamento. **Antes de aprovar a tabela, faça o percurso de uma
  pessoa real dentro dela.**
- **Quando alguém aponta um caso, meça quantos existem — e conserte a regra, não
  o caso.** Aconteceu três vezes em 06/09/2026, sempre com o mesmo formato:
  alguém aponta **um**, a medição acha **N**. Na viúva tipográfica, consertar a
  palavra apontada resolveria **uma** e deixaria **oito** — o detector achou
  nove, um por largura, e o resultado virou regra de quebra para o site inteiro.
- **Prefira uma verificação que roda em tudo a uma inspeção que depende de
  reparar.** A sobreposição do cartão no celular foi achada por um detector
  escrito para o caso — não por olhar tela por tela procurando. Olhar encontra o
  que se procura; verificação encontra o que ninguém procurou, e roda de novo de
  graça na próxima mudança.
- **Confira que você está olhando a tela certa.** Uma varredura de `/entrar` e
  `/cadastro` feita com sessão aberta não valida nada: o `proxy.ts` manda quem
  tem cookie direto para `/painel`, então o que foi inspecionado foi outra
  página. Para validar tela de visitante, esteja deslogado.
- **Ao documentar um padrão de código, escreva o padrão, não a descrição
  dele.** `/^[=+\-@\t\r]/` envelhece na cara de quem lê; "começa com `=`, `+`,
  `-` ou `@`" continua fazendo sentido depois de o código mudar, e por isso
  passa despercebido.
- **Antes de escrever uma proibição, cheque o objeto dela.** "Não commite `X`"
  e "não commite a mudança de `X`" são regras diferentes, e a primeira apaga do
  repositório um arquivo que talvez esteja versionado desde sempre — foi o que
  quase aconteceu com o `next-env.d.ts`. Um `git log --diff-filter=A -- <arquivo>`
  responde em um segundo.
- **Ao afirmar o que está commitado, leia o commit, não o disco.**
  `git show <ref>:<arquivo>`, não `cat`. O working tree carrega o resultado do
  último comando que você rodou, e ele diverge do que está versionado com muito
  mais frequência do que parece.
- O mesmo vale para relato de terceiro sobre número, versão ou estado de
  arquivo: se dá para abrir o código ou rodar o comando, abra e rode. Onde não
  der, **escreva o que verificou e o que não** — "verificado estaticamente",
  "relatado pelo backend", "pendente de confirmação".

- **O nome do parâmetro de retorno é um contrato entre o `proxy.ts` e o
  formulário de login.** O proxy manda `/entrar?redirect=<caminho>`; quem lê
  precisa ler `redirect`. Em 06/09/2026 o proxy mandava `redirect` e o
  formulário lia `next`: **nenhum dos dois estava errado sozinho**, e juntos
  faziam todo mundo cair em `/painel` em vez de voltar para a página pretendida.
  Bug que só existe na junção — e o argumento concreto a favor de integrar cedo,
  porque nenhuma das duas branches conseguiria vê-lo.

### Quando o culpado não é o seu código

Três sintomas diferentes, o mesmo gênero: algo fora do que você escreveu — um
arquivo gerado, uma instância em cache — se comporta como se o seu código
estivesse quebrado. Antes de caçar o bug, descarte estes.

#### `.next` é artefato, nunca evidência

Três sintomas diferentes, a mesma causa: um `.next` que não corresponde ao
código ou ao modo em que você está rodando. **Quando algo inexplicável
acontecer, `rm -rf .next` antes de investigar** — e nunca use o conteúdo dele
para concluir coisa alguma sobre o projeto.

- **`typecheck` falhando em `.next/dev/types/validator.ts`**, com
  `Cannot find module '../../../app/membros/page.js'` e mais oito iguais. O
  `tsconfig` inclui `.next/dev/types/**/*.ts`, então o `tsc` valida um arquivo
  **gerado** que ainda aponta para o caminho antigo — `app/membros/page.tsx`,
  que depois da integração é `app/(app)/membros/page.tsx`. Não é erro do seu
  código: é um `.next` de antes dos route groups.
- **500 em tudo, com `ENOENT .next/dev/routes-manifest.json`.** Acontece ao
  misturar `next build` e `next dev` **no mesmo `.next`** — inclusive rodando o
  build com o servidor de desenvolvimento **vivo**. O diretório fica meio
  produção, meio desenvolvimento, e nada sobe. Parece integração quebrada e não
  é.

  **O hábito, não o aviso:** ao trocar de modo, **derrube o servidor, apague o
  `.next`, então rode.**

  ```bash
  # antes de buildar, com o dev rodando
  # (encerre o next dev)  →  rm -rf .next  →  npm run build
  ```

  **Isto já pegou quem o documentou**, depois de documentado. Armadilha
  conhecida não deixa de pegar; por isso a instrução é um passo a executar e não
  um alerta a lembrar.
#### Outros

- **Data "de hoje" calculada em UTC sai um dia adiantada à noite.**
  `new Date().toISOString().slice(0, 10)` devolve a data **em UTC**: às 21h em
  Brasília já é o dia seguinte lá. Quem lança às 21h30 vê 06/09 na tela e grava
  07/09 — sem erro, sem aviso. **Data do usuário se calcula no fuso do usuário**,
  nunca por `toISOString()`. Ver "A data do lançamento" e `lib/datas.ts`.
- **Data-texto convertida em instante sai um dia atrasada.** `new Date("2026-09-06")`
  é meia-noite **em UTC**, e no fuso de São Paulo imprime **05/09**. Um relatório
  inteiro sai um dia errado e ninguém percebe até a tesouraria fechar o mês.
  **Data que chega como texto é tratada como texto** — fatie a string, não
  converta em `Date` para reformatar.

#### "Escrito em streaming" não é o mesmo que "usa memória constante"

São **afirmações diferentes**, e a segunda **não decorre** da primeira. Só a
medição com volume liga uma à outra.

O download de comprovantes foi escrito em fluxo justamente para não segurar
tudo em memória. Com 500 arquivos de ~1,4 MB, o processo subiu a **1298 MB** — a
resposta inteira estava na memória. A causa: os pedaços eram enfileirados num
**laço** dentro do `pull`. Devolvendo **um pedaço por chamada de `pull`**, o
mesmo zip de 715 MB teve pico de **266 MB**. Cinco vezes menos.

> **As duas versões parecem streaming lendo o código.** Nenhuma revisão pegaria:
> o código não está errado, está **enganando**. E a medição só denuncia **com
> volume** — com 10 comprovantes a memória fica plana nas duas, e 10 é
> exatamente o que alguém testaria.

- **Sinal de alerta no código:** laço que enfileira. Se o **produtor** decide
  quantos pedaços entrega, em vez de o **consumidor** pedir, não há
  contrapressão.
- **Como evitar:** **meça com o volume que o pior caso real produz**, não com o
  que é cômodo de montar.
- Vale para qualquer otimização cuja propriedade é **invisível no código**:
  lazy, paginação, cache, fila.

- **`POST /api/auth/switch` revoga a sessão anterior.** Guardar o cookie velho
  para "voltar rápido" devolve **401** — e parece falha de isolamento quando é
  só cookie revogado. **Toda troca de igreja é sessão nova**; releia o cookie da
  resposta.

#### Órfão: existe, não é chamado, e promete o que não entrega

Irmão do resíduo, uma camada acima: não é uma regra que sobrou, é uma peça
inteira que ninguém usa.

- **`purgeStaleSessions()` está em `lib/auth.ts` e ninguém chama** — a tabela
  `sessions` cresce para sempre. Código que existe e ninguém chama é a mesma
  classe da permissão que aparece no seletor e não governa nada.
- **A distinção que decide o caso:** órfão que **promete** alguma coisa sai;
  órfão invisível pode ficar. As permissões `people.*` saíram na migration 010
  porque apareciam no seletor de papéis e sugeriam poder inexistente; a coluna
  `timezone` ficou porque não aparece em lugar nenhum e não promete nada.
- **Como procurar:** `grep` pelo nome do símbolo no repositório. Uma única
  ocorrência é a declaração — ninguém chama.

#### Entrada inválida tem que virar 4xx, não 500

Duas ocorrências do mesmo gênero: o que o cliente manda errado cai no catch
genérico e vira erro de servidor, fazendo quem errou concluir que o servidor
quebrou.

- Corpo JSON malformado devolvia **500** em todas as rotas. Resolvido pelo
  `readJson` de `lib/http.ts`, que devolve `400 invalid_json`.
- **`PATCH /api/users/<id>` com id malformado ainda devolve 500** em vez de 404
  — uuid válido inexistente devolve 404 certo. **Valide o formato do id antes de
  usá-lo numa consulta**, senão o erro do driver vira erro de servidor.

- **Armadilha registrada por quem a encontrou está completa para o terreno dele
  e possivelmente incompleta para os outros.** Antes de fechar, pergunte a quem
  tem contexto diferente se ela é pior no terreno dele — **não por cortesia, por
  método**. O custo é uma pergunta; o que se descobre pode ser de outra classe.

  **A quem perguntar** (senão vira "pergunte a todos", e ninguém pergunta a
  ninguém): a quem tem **acesso, dado ou responsabilidade que você não tem** —
  quem carrega o segredo, quem tem o banco, quem tem a tela, quem tem a máquina.

  O incidente é esta seção. A armadilha do relatório adulterado foi registrada
  como perda de informação, e estava certa assim. Quem carrega credencial no
  ambiente olhou **a mesma mecânica** e viu vazamento de segredo — outra classe,
  outra gravidade, mesma linha de código. A diferença não foi atenção: foi
  contexto.

#### O que essas armadilhas têm em comum

Vale ler junto, porque separadas cada uma parece um caso isolado e o padrão é o
que importa: **a verificação passa, o texto fecha, o sistema responde — e o que
chega está errado.**

**Nenhuma delas seria pega olhando com mais atenção.** Foram pegas medindo a
coisa certa, ou porque alguém desconfiou de uma pista pequena e conferiu na
hora:

- uma frase lida numa tela dizia que o `linger` estava ligado;
  `loginctl show-user` devolveu o contrário — **um comando**;
- um relato de integração não mencionou que a migration renomeava uma coluna;
  o código dizia, e a documentação teria envelhecido calada — **um `grep`**;
- uma frase do próprio relatório ficou estranha ao reler; era o shell tendo
  comido duas palavras — **uma releitura**;
- um download escrito em fluxo consumia 1298 MB; com 10 arquivos a memória fica
  plana e o código parece certo nas duas versões — **uma medição com volume
  real**.

Repare em **por onde** cada uma engana: por artefato (`.next`), por documento (a
migration órfã), por canal (o shell), por regra externa (o CNPJ) e pelo próprio
código (o streaming). Camadas diferentes, mesma assinatura — e a defesa não
muda.

Três assuntos técnicos diferentes, o mesmo método. Daí os dois corolários:

> **Atenção não é defesa contra essa classe. Medir é** — e, do lado
> construtivo, **contexto também**: a mesma observação lida por quem tem outro
> acesso vira outra classe de risco.
>
> **Pista pequena e barata de conferir se confere na hora** — o custo de
> conferir é quase sempre menor que o custo de estar errado por horas, e quem
> espera acumular evidência já está errado esse tempo todo.

E o terceiro, sobre **como** essas cinco apareceram:

> **Nenhuma apareceu em busca por defeitos. Todas apareceram em verificação** —
> três embutidas no trabalho (um `typecheck` depois de sincronizar, um teste
> ponta a ponta, uma releitura do próprio texto) e **duas exigidas antes de
> entregar** (conferir a fonte antes de implementar a regra do CNPJ; medir a
> memória antes de dar o download por pronto).
>
> Procurar defeito no abstrato não funciona. Verificar uma **afirmação
> concreta** funciona — por hábito ou porque alguém pediu.
>
> **Exigir a medição antes da entrega é o único desses caminhos que se pode
> planejar.** Hábito não se agenda; cobrança sim. Por isso **"meça antes de me
> entregar" vale como pedido padrão sempre que a propriedade que importa for
> invisível no código** — e foi exatamente uma cobrança dessas que produziu o
> achado mais caro: 1298 MB contra 266 MB.

#### A tela afirma o que ninguém leu

- **Estado vazio depois de uma leitura que falhou.** Com papel de leitura,
  `/financeiro` dizia "Nenhum lançamento ainda" quando o que houve foi um
  **403** — a igreja podia ter mil lançamentos. A tela **afirmava sobre o dado
  da igreja uma coisa que ninguém leu.** As seis listagens passaram a distinguir
  "não tem registro" de "a leitura falhou". **Estado vazio só depois de uma
  leitura que deu certo.**
- **Indicador que não leva o filtro mente ao vivo.** As contagens vinham em
  requisições separadas, sem o filtro da tela: com `status=Inativo` a lista
  mostrava 4 e "Total ativos" mostrava 14 da igreja inteira. **Indicador que
  acompanha uma lista filtrada tem que usar o mesmo filtro** — os três que
  haviam sido removidos eram a baixa honesta; os que ficaram é que estavam
  errados.
- **Permissão precisa ser checada no menu e no botão, não só a somente-leitura.**
  O menu oferecia Financeiro e Usuários ao papel de leitura, e os botões de
  criar só olhavam somente-leitura: o usuário via "Novo Membro" e levava 403.

  Os dois primeiros só apareceram porque existia **uma conta com duas igrejas e
  papéis diferentes**. Conta de teste que reproduz a variedade real paga o
  próprio custo.
- **Lista de opções fixa no código, esperando ser substituída.** O campo
  "Ministério Principal" nasce com `["Nenhum", "Louvor", "Missões",
  "Acolhimento", "Infantil"]` como estado inicial e só troca pela lista real da
  igreja **se a resposta vier `ok`** — o `catch` engole o resto. Numa igreja sem
  ministério nenhum, uma leitura que falha faz a tela oferecer quatro que não
  existem; e a escolha é descartada em silêncio no servidor, que resolve pelo
  nome dentro da organização, não acha e grava nulo. **Valor de exemplo dentro
  do `useState` vira afirmação sobre a igreja no dia em que a leitura falha.** A
  saída é a mesma da primeira armadilha desta lista: lista vazia até a leitura
  dar certo, e erro visível quando não der.
- **Enfeite que promete dado.** O sino do cabeçalho carrega a classe `has-dot`
  fixa — o pontinho vermelho de "tem coisa nova" aparece em igreja criada há
  cinco minutos e sem um único registro — e o botão não tem `onClick`.
  **Controle que não faz nada não pode ter aparência de quem tem novidade.** Dá
  para deixar sem implementar; não dá para deixar prometendo.

#### Marca gravada na criação, lida como se fosse atual

Booleano ou derivado que é escrito uma vez e nunca revisto, e que uma tela
depois apresenta como estado de agora: `is_new` prometendo "novos este mês",
`is_recent` que nada limpava. **Derive da data.** Ao procurar, não pare nos
booleanos — a doença não é do tipo.

#### Resíduo de decisão antiga sobrevivendo onde ninguém olhou

O gênero mais produtivo de defeito visual que apareceu em 06/09/2026: uma regra
que fazia sentido para um arranjo que não existe mais continua aplicada. **Vale
procurar por isso de propósito** — o terceiro caso abaixo foi achado assim,
antes de virar defeito relatado.

**Como evitar:** ao remover ou esconder um elemento, procure o que existia *por
causa dele* — a coluna do grid, a largura reservada, o `nowrap` que fazia
sentido na tabela. Ao mudar um arranjo, releia as regras escritas para o
arranjo anterior; elas não somem sozinhas.

- **Esconder um elemento sem desfazer o `grid` que o dimensionava imprime um
  item sobre o outro.** No celular, ocultar o ícone do cartão sem voltar o grid
  de duas colunas para uma jogava rótulo e valor na mesma coluna de 40px, e o
  cartão exibia "TOTAL 4 DE CÉLULAS". `display: none` tira o conteúdo, **não** a
  coluna que existia para ele.
- Em `/visitantes`, a **etapa de integração — o assunto da tela** — truncada por
  um cálculo de largura herdado de um padrão de cartão já abandonado.
- Em `/financeiro`, `nowrap` com ellipsis que só faz sentido em coluna de
  tabela, sobrevivendo no cartão do celular.

#### Contexto de declaração determina comportamento

Duas regras irmãs, e **nenhuma das duas aparece em `typecheck` ou `build`**:

- **Onde a regra de CSS mora determina onde o componente funciona** — ver
  "Arquitetura".
- **Onde o hook é chamado determina o que ele enxerga.** `useCurrentUser()`
  chamado no componente que *renderiza* o provider está **acima** dele, e lê o
  valor padrão: o cartão de perfil mostrava "Administrador" enquanto a topbar
  mostrava o usuário real, na mesma tela.
- **`next-env.d.ts` aparecendo sujo no `git status` sem você ter tocado nele.**
  O arquivo **é versionado desde o primeiro commit do repositório e tem que
  continuar** — sem ele, o Next reclama no primeiro build limpo. O que não se
  commita **não é o arquivo, é a alternância**: a linha de `import` troca entre
  `./.next/types/routes.d.ts` e `./.next/dev/types/routes.d.ts` conforme o
  último comando ter sido `build` ou `dev`, e o Next regrava sozinho.
  A versão canônica é a de **build** (`./.next/types/routes.d.ts`): é a que está
  commitada e a que um `npm run build` limpo produz, então depois de um build o
  `git status` fica limpo. Quem rodar `npm run dev` vai ver o arquivo sujo com a
  variante de dev — é esperado.
  **Descarte a mudança:** `git checkout -- next-env.d.ts`, que devolve exatamente
  a canônica. Não commite a alternância, **não ponha no `.gitignore`** e **não
  faça `git rm --cached`** — as duas últimas tiram o arquivo do repositório, que
  é exatamente o que não pode acontecer.
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

## Banco e migrations

- A variável obrigatória é `DATABASE_URL`; nunca versione credenciais reais.
- Piso de versão: **PostgreSQL 15+** — era 13+ pelo `gen_random_uuid()` nativo,
  e subiu na `006`, que usa `ON DELETE SET NULL` com lista de colunas.
- `npm run db:status` compara as migrations do disco com as aplicadas e **só
  lê**. É o comando para responder "o banco está em dia?" sem escrever nada.
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
- **Alinhamento (decisão do Lucas, 06/09/2026):** texto corrido de cartão e
  linha de tabela fica **à esquerda** — centralizar faz perder o ponto de
  retorno da linha e a leitura fica mais lenta. **Número, rótulo, estado vazio e
  ação ficam centralizados.**
- **No celular o título da página não aparece:** ele duplicava a barra de cima e
  custava ~68px da primeira dobra.
- Preserve os tokens em `:root`, especialmente cores, bordas e easing.
- Toda cor vive em token — o tema escuro é só uma troca de variáveis.
- A fonte é **Inter**, via `next/font/google` e a variável `--font-sans`.
  Inputs, selects, textareas e botões devem herdá-la.
- Selects devem usar a seta customizada com recuo de `16px`.
- Painéis usam borda `--border`, fundo `--panel` e raio de `12px`.
- Títulos e ações primárias usam `--heading`.
- Hovers e animações devem ser sutis e respeitar `prefers-reduced-motion`.
- **Encadeamento não é atraso.** Três cartões entrando com 110 ms de diferença
  são três entradas simultâneas, não um caminho: **nada começa antes de o
  anterior terminar**. Meça com `getAnimations()`, não estime.
- Para encadear, use **propriedade custom**: ela chega ao pseudo-elemento.
  `transition-delay` não chega — não é herdado.
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
- Membros, visitantes e ministérios com busca, filtros, paginação e
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
