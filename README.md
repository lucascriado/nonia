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

### 1. De onde vem a `DATABASE_URL`

Não há Postgres nesta máquina e o `.env.example` **não serve como está**: ele
traz um endereço de exemplo, não a conexão real.

**Peça ao administrador de VPS a `DATABASE_URL` do banco de desenvolvimento
(`nonia_dev`).** O acesso é por um **túnel SSH** que precisa estar de pé — sem
ele, a string correta também não conecta.

> ### ⚠ `password authentication failed for user "nonia"`
>
> Se você seguiu o `.env.example` sem trocar nada, é esta a mensagem que
> aparece. Ela engana: **não** significa que existe um Postgres local com a
> senha errada.
>
> **A porta 127.0.0.1:5432 é a ponta do túnel, não um banco local.** Alguém
> responde ali, e por isso o erro é de autenticação em vez de "connection
> refused" — o que faz procurar senha em vez de procurar a conexão certa.
>
> Três fatos que economizam a mesma hora:
>
> - **5432 local é o túnel**, serviço `nonia-db-tunnel.service`, que precisa
>   estar ativo;
> - o Postgres embarcado na porta **54329 não é do nonia** — é de outra coisa
>   nesta máquina, não aponte a `DATABASE_URL` para ele;
> - existe um `.env.dev` **fora do repositório**, com o administrador de VPS.

### 2. Instalar e rodar

```bash
cp .env.example .env        # substitua a DATABASE_URL pela que você recebeu
npm install
npm run db:status           # só lê: diz se o banco está em dia
npm run dev                 # http://localhost:3000
```

`npm run typecheck` é o único comando desta lista que funciona sem banco.

### 3. Migrations e seed — banco próprio ou banco do time?

**A resposta muda o que você pode rodar.** O `nonia_dev` é **compartilhado**:
todo mundo do time trabalha nele ao mesmo tempo.

| Comando | Banco próprio | `nonia_dev` compartilhado |
| --- | --- | --- |
| `npm run db:status` | sim | **sim** — só lê, é o jeito seguro de saber se falta migration |
| `npm run db:migrate` | sim | **não** — quem aplica migration no banco do time é o integrador, junto da integração |
| `npm run db:seed:dev` | sim | **não** — o seed escreve na organização `demo`, que as outras pessoas estão usando |

Acesso de desenvolvimento depois do seed: `demo@nonia.app` / `demo1234`.

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
