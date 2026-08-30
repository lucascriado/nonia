# nonia

Plataforma de gestão ministerial: membros, visitantes, células, ministérios,
agenda e financeiro.

- **Repositório:** `git@github.com:lucascriado/nonia.git` (público)
- **Produção:** <https://nonia.app> e `www.nonia.app`
- **Local:** `C:\www\nonia`

## Stack

Next.js 16 (App Router) em TypeScript, com `sequelize` sobre `pg`,
`lucide-react` nos ícones e `sonner` nos toasts. Fonte Fustat via
`next/font/google`.

```
app/
  api/  atividades/  calendario/  celulas/  configuracoes/
  financeiro/  membros/  ministerios/  visitantes/
  layout.tsx   page.tsx   icon.svg
database/
  migrate.mjs  migrations/  seeds/
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | desenvolvimento |
| `npm run build` | build de produção |
| `npm start` | serve o build |
| `npm run db:migrate` | aplica as migrações |
| `npm run db:seed:dev` | migrações + dados de desenvolvimento |
| `npm run typecheck` | `tsc --noEmit` |

## Deploy

Coolify, projeto `nonia.app` (`lsakrj0hpdnxvkzhpntb8ovc`, ambiente
`production` = `t0ii3a9aaedyqgiun5pakzcz`).

| Recurso | UUID |
| --- | --- |
| Aplicação | `kwrgi931sbihj4dzgrxmm78g` |
| Postgres | `bqjppoiopkvcy4kjhr22n93j` |

Build pack `dockerfile`, porta **3000**, push na `main` dispara o deploy pelo
GitHub App. **As migrações rodam sozinhas no boot** — o `CMD` do Dockerfile é
`node database/migrate.mjs && node server.js`.

> **O deploy demora ~2 minutos a mais que os outros projetos.** O Dockerfile
> tem `HEALTHCHECK --start-period=30s` batendo em `/api/health`, e o Coolify
> espera esse healthcheck passar antes de trocar o container. Ver o container
> antigo logo depois do push é normal — não conclua que o auto-deploy falhou
> sem esperar esses dois minutos.

## Banco

Postgres 17-alpine no Coolify. Atenção: usuário e base são **`postgres`**, não
`nonia` — o banco foi recriado em 30/08/2026 e nasceu com os padrões.

```
postgres://postgres:<senha>@bqjppoiopkvcy4kjhr22n93j:5432/postgres
```

A senha está no `CLAUDE.md` da raiz (`C:\Users\lucas\CLAUDE.md`), junto do
resto da infraestrutura. A única variável obrigatória é `DATABASE_URL`;
`PORT` e `NODE_ENV` estão gravadas explicitamente.

## Alterações em 30/08/2026

- **Publicado na VPS.** Antes o domínio apontava para `2.57.91.91`, que não era
  outro servidor — era a **página de domínio estacionado da Hostinger**
  (`Server: hcdn`), o destino padrão de um domínio que não aponta para lugar
  nenhum. Não havia nada publicado ali.
- **Domínio migrado para o Cloudflare**, hoje proxied com SSL `strict`.
- **`app/icon.svg` passou a ser branco sobre o quadrado escuro** (`#1e293b`).
  O símbolo é o mesmo; o `#4648d4` anterior sumia na barra de abas escura do
  navegador. O desenho ficou no mesmo tratamento do ticketboard — quadrado
  arredondado colorido, glifo branco.
- **Título passou a ser `nonia.app`** (era "Nonia"), no `metadata` do
  `app/layout.tsx`, incluindo o `template`.

## Cuidado

O `metadataBase` do `layout.tsx` ainda aponta para `https://nonia.io`, que não
é o domínio real (`nonia.app`). Isso afeta URLs absolutas de Open Graph.
