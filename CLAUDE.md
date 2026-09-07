# nonia — estado do projeto

Plataforma de gestão ministerial (membros, visitantes, células, ministérios,
agenda, financeiro) sendo transformada em **SaaS multi-igreja**.

Este arquivo descreve **o que existe hoje** e **o que foi decidido**. Convenções
de código estão em [`AGENTS.md`](AGENTS.md); como rodar o projeto, no
[`README.md`](README.md). Não duplique conteúdo entre os três.

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
| Base `postgres` do servidor | **É a base de PRODUÇÃO desde 07/09/2026.** 32 tabelas, migrations **001–019**, 4 planos, 5 papéis, 25 permissões — e **0 organizações, 0 usuários**. O baseline vazio (`~/backups/nonia-2026-09-06.sql`) virou **histórico**, não é mais o estado |
| Domínio `nonia.app` | **Continua não respondendo**, e nada aponta para ele. Isso **não** significa "não há produção": ela mora em `nonia.lucascriado.com`. O nome `nonia.app` sobrevive como nome do **projeto** no Coolify, o que engana quem lê rápido |
| Autenticação | **Integrada na `main`** em 06/09/2026. Sessão própria, RBAC e escopo de tenant em todas as rotas de `app/api` |
| Multi-tenancy | **Integrado na `main`.** `organization_id` em toda tabela de domínio, com backstop de FK composta no banco |
| Integração | **Feita em 06/09/2026**, `main` em `4b67d08`: Fase 1 e site público mesclados, `typecheck` limpo e `build` passando contra o `nonia_dev`. Depois disso a `main` seguiu andando — o que entrou hoje está em "O que entrou em 07/09/2026" |
| Banco de desenvolvimento | **Contorno desta máquina, não a arquitetura pretendida** — ver "Por que existe um banco compartilhado". `nonia_dev`, no Postgres do Coolify (**18.6**), base separada da `postgres`, com as migrations **001–019** aplicadas e o seed rodado. Não há PostgreSQL nesta máquina — o acesso é pelo túnel SSH `nonia-db-tunnel.service`, que escuta só em `127.0.0.1:5432`. Detalhes com o admin de VPS, em `/home/lucas/claude.md` |

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

> ### Produção está VAZIA, e isso muda como ler este arquivo
>
> **0 organizações e 0 usuários.** Nada do que subiu foi exercitado contra dado
> real de igreja em produção. Todo "medido", "verificado" e "percorrido" deste
> arquivo se refere ao **`nonia_dev`** e ao **`nonia_front`**, salvo onde
> estiver escrito o contrário. Deploy que sobe não é funcionalidade exercitada,
> e chamar uma coisa da outra é o mesmo erro do `build` passando: artefato não é
> evidência de comportamento.
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
  convenção "Segredos e interpolação" em [`AGENTS.md`](AGENTS.md).
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
- `CLAUDE.md`, `AGENTS.md`, `README.md` e `database/README.md` são mantidos pelo
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
database/       migrate.mjs, migrations/ (001–019), seeds/
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
| **`timezone` não é exposto na tela** | **Reescrita em 07/09/2026: a coluna deixou de ser órfã.** `lib/datas.ts` a usa para calcular "hoje" no fuso da igreja, e dela dependem a validação do lançamento retroativo e o período padrão do kardex. O que continua de pé é **não colocar seletor de fuso na interface** — o valor é o default `America/Sao_Paulo` da 004 para todo mundo, e uma igreja em Manaus só sai disso por `UPDATE`. Seletor entra quando houver igreja em outro fuso, não antes | 06/09, reescrita em 07/09/2026 |
| **Perfil próprio em rota própria** | `PATCH /api/auth/profile`, não um caso especial dentro de `/api/users/[id]` — aquela rota existe para agir sobre **terceiros**, e todas as guardas dela são recusas de agir sobre si | 06/09/2026 |
| **Coluna órfã fica; permissão órfã sai** | A `timezone` ficou — e em 07/09/2026 **deixou de ser órfã**, quando `lib/datas.ts` passou a lê-la; guardar a coluna foi a decisão certa. As `people.*` saíram na migration **010**. A coluna **não promete nada a ninguém**, porque não aparece em lugar nenhum; a permissão aparece no seletor de papéis e promete poder que não existe. Papéis agora: owner 22, admin 21, secretaria 18, líder 12, leitura 9 | 06/09/2026 |
| **Carência de 7 dias** | Contados do vencimento, antes de virar somente leitura | 06/09/2026 |
| **Somente leitura vem de DÍVIDA, não de ausência de plano pago** | Cancelar leva ao gratuito, com o teto do gratuito; **atrasar** leva a somente leitura. Sem essa distinção, cancelar seria melhor que atrasar e o somente leitura seria contornável em um clique | 06/09/2026 |
| **Exportar entra no MVP** | A promessa "quem quiser sair leva o que é seu" só era verdadeira pela API — não havia botão de exportar em lugar nenhum. Decidido implementar em vez de recuar a promessa. Formato e cuidados em [`AGENTS.md`](AGENTS.md) | 06/09/2026 |
| **Bypass de contratação no lugar do gateway** | A igreja clica e a assinatura vale na hora, sem pagamento real. Atalho de desenvolvimento, **não é produto**, e nasce com guarda-corpo obrigatório. Ver "Cobrança" | 06/09/2026 |
| **Mercado Pago: API de Pagamentos, não recorrência** | `POST /v1/payments`, Checkout Transparente. **Decisão suspensa**, não revogada: vale para quando o pagamento real entrar. **Retomar quando** houver hospedagem com URL pública. Ver "Cobrança" | 06/09/2026 |
| **`public/` fica versionado, mesmo vazio** | O `Dockerfile` faz `COPY` dele. A alternativa era remover a linha do `Dockerfile`, e foi descartada: `public/` é o **diretório padrão do Next** para estáticos, então remover a linha resolveria hoje e criaria uma armadilha no dia em que alguém puser um arquivo lá e ele não aparecer na imagem. O `.gitkeep` traz um comentário dizendo por que existe | 06/09/2026 |
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
  todas as rotas de `app/api`. Contrato em [`AGENTS.md`](AGENTS.md).
- Papéis com nível: `owner` (100), `admin` (80), `secretaria` (60), `lider`
  (40), `leitura` (20), e 24 permissões `recurso.acao`.
- Acesso de dev após `npm run db:seed:dev`: `demo@nonia.app` / `demo1234`.
  `npm run auth:owner` cria o proprietário de uma organização órfã.

### Do frontend — `feat/ui-theme`

Numa segunda leva (`562e267`) entraram `/precos` e o conserto do parâmetro de
retorno do login — o bug de junção descrito em [`AGENTS.md`](AGENTS.md), que
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
exercitado com dado real de igreja em produção**, que tem 0 organizações e 0
usuários. Subiu no deploy; não foi usado.

### Migrations 018 e 019

Aplicadas nos três bancos — `nonia_dev`, `nonia_front` e **produção**.

- **018** — `whatsapp_contacts.avatar_url` e `avatar_checked_at`.
- **019** — `financial_transactions.retroactive` e `retroactive_reason`, com
  `CHECK (retroactive_reason IS NULL OR retroactive)`: o motivo não existe sem a
  marca. O `CHECK` **não** compara com `CURRENT_DATE` — não seria imutável e
  dependeria do fuso da sessão, que é exatamente o defeito que a 019 não quis
  herdar.

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

Nasceu com o lançamento retroativo e **não conserta o defeito de UTC**; ele
existe para **impedir que uma regra nova nascesse em cima do defeito**. A regra
do retroativo é inteiramente sobre data: com o "hoje" de UTC ela erraria três
horas por dia, justamente no horário em que a secretaria lança o culto da noite.

Usa `organizations.timezone`, com `America/Sao_Paulo` de fallback, e é
consumido por **dois lugares só**: a validação do lançamento retroativo
(`lib/finance-records.ts`) e o período padrão do kardex (`lib/finance-kardex.ts`).
Ver a pendência do UTC, que **continua aberta**.

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
auto-suficiente: **19 migrations**, seed idempotente com login de demonstração, e
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
| **Data gravada em UTC nasce errada à noite — CONTINUA ABERTA, e mudou de forma em 07/09/2026.** Medido em 06/09/2026: às 21h30 em Brasília, o local é 06/09 e o gravado é **07/09**. Todo lançamento criado **entre 21h e meia-noite** cai no dia seguinte — e no dia 30 ou 31, no **mês** seguinte, deslocando o fechamento da tesouraria. É dado contábil, e reunião de igreja termina de noite. **O que mudou:** existe `lib/datas.ts`, que calcula "hoje" no fuso da igreja por `organizations.timezone` — mas ele é usado **só** pela validação do lançamento retroativo e pelo período padrão do kardex. Ele foi escrito para **não deixar uma regra nova nascer em cima do defeito**, não para consertá-lo. **Os três lugares do defeito continuam intocados:** `components/financial-record-dialog.tsx:28`, o `defaultValue` de `transactionDate` em `lib/models.ts` e o `DEFAULT CURRENT_DATE` do banco (`003`). Quem ler o `lib/datas.ts` e achar que a pendência fechou está errado. **A correção carrega uma escolha de desenho** — usar o `timezone` da organização, como o `datas.ts` já faz, ou fixar `America/Sao_Paulo` — e mudá-la muda o que a igreja vê e o que passa a ser gravado. Decisão do Lucas | 06/09, revista em 07/09/2026 |
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
