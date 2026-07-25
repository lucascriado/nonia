# Nonia

Plataforma de gestão ministerial: membros, visitantes, células, ministérios,
agenda, financeiro e histórico de atividades.

- **Stack**: Next.js 16 (App Router), React 19, TypeScript, Sequelize v6 e PostgreSQL.
- **Frontend**: CSS global com design tokens (sem Tailwind), Lucide e Sonner.
- **Backend**: Route Handlers em `app/api`, banco versionado por migrations SQL.

## Desenvolvimento local

Pré-requisitos: Node 22+ e um PostgreSQL 13+ acessível.

```bash
cp .env.example .env        # ajuste a DATABASE_URL
npm install
npm run db:migrate          # cria o schema do zero
npm run db:seed:dev         # (opcional) dados de demonstração
npm run dev                 # http://localhost:3000
```

Também dá para subir tudo com Docker Compose (app + PostgreSQL):

```bash
docker compose up --build
```

## Validação

```bash
npm run typecheck
npm run build
```

## Deploy no Dokploy

O projeto está pronto para deploy direto pelo Dockerfile. As migrations rodam
automaticamente na inicialização do container — um banco vazio é preparado
sozinho no primeiro boot.

1. **Banco**: no Dokploy, crie um serviço **PostgreSQL** (16/17). Anote usuário,
   senha e o host interno do serviço.
2. **Aplicação**: crie uma **Application** apontando para este repositório.
   - Build Type: `Dockerfile` (na raiz).
   - Porta do container: `3000`.
3. **Variáveis de ambiente** da aplicação:

   ```env
   DATABASE_URL=postgresql://usuario:senha@host-interno-do-postgres:5432/nonia
   ```

4. **Domínio**: adicione `nonia.io` (ou o subdomínio desejado) com HTTPS.
   Health check disponível em `GET /api/health`.

Alternativamente, use o `docker-compose.yml` como projeto **Compose** no
Dokploy — ele já sobe app e banco juntos (defina `POSTGRES_PASSWORD`).

## Estrutura

```
app/            páginas (App Router) e APIs em app/api
components/     componentes compartilhados (shell, sidebar, diálogos, skeletons)
lib/            conexão (db.ts), models Sequelize, utilitários
database/       migrations SQL, seed de desenvolvimento e executor (migrate.mjs)
public/         arquivos estáticos
```

Mais detalhes sobre banco e migrations em [`database/README.md`](database/README.md).
Convenções de código e arquitetura em [`AGENTS.md`](AGENTS.md).
