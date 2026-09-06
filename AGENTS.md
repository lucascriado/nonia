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

## Documentação

`CLAUDE.md`, `AGENTS.md`, `README.md` e `database/README.md` têm dono único, e
cada um tem um assunto: estado e decisões, convenções de código, como começar,
banco. Não repita conteúdo entre eles — aponte.

**Quando duplicar for a escolha certa**, e às vezes é: o critério não é o
conteúdo, é o **público**. Duplica-se quando duas pessoas chegam por caminhos
diferentes e nenhuma passa pelo outro texto — quem vai implementar lê a seção,
quem faz varredura antes de expor o sistema lê a tabela de pendências. Duplicar
por preguiça de escolher onde vai é outra coisa.

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

- **Data-texto convertida em instante sai um dia atrasada.** `new Date("2026-09-06")`
  é meia-noite **em UTC**, e no fuso de São Paulo imprime **05/09**. Um relatório
  inteiro sai um dia errado e ninguém percebe até a tesouraria fechar o mês.
  **Data que chega como texto é tratada como texto** — fatie a string, não
  converta em `Date` para reformatar.

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
  comido duas palavras — **uma releitura**.

Três assuntos técnicos diferentes, o mesmo método. Daí os dois corolários:

> **Atenção não é defesa contra essa classe. Medir é** — e, do lado
> construtivo, **contexto também**: a mesma observação lida por quem tem outro
> acesso vira outra classe de risco.
>
> **Pista pequena e barata de conferir se confere na hora** — o custo de
> conferir é quase sempre menor que o custo de estar errado por horas, e quem
> espera acumular evidência já está errado esse tempo todo.

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
