# nonia

Plataforma de gestão ministerial: membros, visitantes, células, ministérios,
agenda, financeiro e histórico de atividades. Em transformação para SaaS
multi-igreja.

- **Stack**: Next.js 16 (App Router), React 19, TypeScript, Sequelize v6 e PostgreSQL.
- **Frontend**: CSS global com design tokens (sem Tailwind), fonte Inter, Lucide e Sonner.
- **Backend**: Route Handlers em `app/api`, banco versionado por migrations SQL.

> **O nonia roda localmente.** Não há ambiente hospedado, domínio nem deploy —
> decisão de 06/09/2026. Estado do projeto, decisões e pendências em
> [`CLAUDE.md`](CLAUDE.md).

## Desenvolvimento local

Pré-requisitos: Node 22+ e **PostgreSQL 15 ou superior** (o banco do time roda
18.6). **Docker não faz parte deste ambiente** — o `docker-compose.yml` existe
no repositório, mas não há Docker instalado nas máquinas do time; não conte com
ele para subir o projeto.

### 1. Suba um Postgres na sua máquina

**É o caminho oficial**, e não depende de ninguém: este repositório é
auto-suficiente. Instale PostgreSQL 15+, crie um banco, aponte a
`DATABASE_URL` do seu `.env` para ele e siga.

```bash
cp .env.example .env        # aponte a DATABASE_URL para o seu Postgres
npm install
npm run db:migrate          # cria o schema do zero
npm run db:seed:dev         # dados de demonstração
npm run dev                 # http://localhost:3111
```

Acesso depois do seed: `demo@nonia.app` / `demo1234`. Para criar o proprietário
de uma organização sem usuário, `npm run auth:owner -- --email … --name …
--password …`.

Banco por pessoa é **melhor** que um banco comum: o dado de teste de um não
atrapalha o outro, e não existe o risco de apontar para o banco errado — que
aconteceu duas vezes em 06/09/2026.

`npm run typecheck` é o único comando desta lista que funciona sem banco.

### 2. O `nonia_dev` compartilhado é contorno, não arquitetura

Na máquina de desenvolvimento original não foi possível instalar Postgres — o
`sudo` pede uma senha que ninguém do time tem. O contorno foi usar um banco
remoto, o `nonia_dev`, por um túnel SSH.

**Isso é limitação daquela máquina e não se transfere.** Quem tem administrador
no próprio computador não herda o problema e deve usar banco local.

> **O acesso ao banco compartilhado é administrativo e não é transferível.** O
> túnel autentica com a credencial de administração do servidor, que também
> roda outros sistemas — não é algo que se replique na máquina de cada pessoa,
> e não há como conceder "só o banco" por esse caminho. Não peça, não
> compartilhe: use banco local.

Se você estiver **naquela máquina**, o `.env` já aponta para o túnel, e valem os
avisos abaixo.

> ### ⚠ `password authentication failed for user "nonia"`
>
> É o que aparece ao usar o `.env.example` sem trocar nada **naquela máquina**.
> A mensagem engana: **não** significa um Postgres local com senha errada.
>
> **A porta 127.0.0.1:5432 lá é a ponta do túnel, não um banco local.** Alguém
> responde ali, e por isso o erro é de autenticação em vez de "connection
> refused" — o que faz procurar senha em vez de procurar a conexão certa.
>
> Ainda naquela máquina: o túnel é o serviço `nonia-db-tunnel.service` e precisa
> estar ativo; o Postgres embarcado na porta **54329 não é do nonia**; e existe
> um `.env.dev` fora do repositório.

### 3. Migrations e seed — banco próprio ou compartilhado?

No **seu** banco, rode o que quiser. Contra o `nonia_dev` compartilhado, não:

| Comando | Banco próprio | `nonia_dev` compartilhado |
| --- | --- | --- |
| `npm run db:status` | sim | **sim** — só lê, é o jeito seguro de saber se falta migration |
| `npm run db:migrate` | sim | **não** — quem aplica migration no banco do time é o integrador, junto da integração |
| `npm run db:seed:dev` | sim | **não** — o seed escreve na organização `demo`, que as outras pessoas estão usando |

## Validação

Rode os dois antes de finalizar qualquer alteração:

```bash
npm run typecheck
npm run build
```

## Estrutura

```
app/            páginas (App Router) e APIs em app/api
components/     componentes compartilhados (shell, sidebar, diálogos, skeletons)
lib/            conexão (db.ts), models Sequelize, utilitários
database/       migrations SQL, seed de desenvolvimento e executor (migrate.mjs)
public/         arquivos estáticos — mantido versionado, ver abaixo
proxy.ts        desvio de navegação no Edge
```

`public/` é o diretório padrão de estáticos do Next e fica versionado mesmo
vazio, com um `.gitkeep`: o `Dockerfile` faz `COPY` dele, e sem o diretório o
build da imagem falha. Não apague.

## Onde continuar

| Assunto | Arquivo |
| --- | --- |
| Estado real, decisões de arquitetura, worktrees, infraestrutura e pendências | [`CLAUDE.md`](CLAUDE.md) |
| Convenções de código, arquitetura e regras para agentes | [`AGENTS.md`](AGENTS.md) |
| Banco, migrations e valores persistidos | [`database/README.md`](database/README.md) |

Parte do contexto vive **fora deste repositório**, de propósito — identificador
de infra, host e credencial não entram em repositório público:

| O que | Onde | Quem mantém |
| --- | --- | --- |
| Servidor, banco, túnel, firewall, credenciais | `claude.md` na home da máquina de desenvolvimento | administrador de VPS |
| Relatório de infraestrutura da Fase 0 | `FASE0-INFRA.md`, ao lado do repositório | administrador de VPS |

Peça a ele o que precisar de lá.
