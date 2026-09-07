#!/usr/bin/env bash
# Sobe o ambiente de teste do zero: banco virgem + servidor, e PROVA que os
# dois são o mesmo banco antes de devolver o controle.
#
# Existe porque três tentativas seguidas mediram a coisa errada:
#  - o banco chamava 'contagens' e as suítes têm '/nonia' fixo na string;
#  - `pgrep -f "next dev -p 3210"` casa com a PRÓPRIA linha de comando de quem
#    o executa, então o script matava o próprio shell;
#  - quem prende a porta é o filho `next-server`, cuja linha de comando NÃO
#    contém "next dev" -- matar pelo padrão deixava o servidor velho de pé,
#    apontando para um banco já apagado.
# Daí matar pelo DONO DA PORTA, e não por nome de processo.
set -u
PORT=3210
DB=postgresql://nonia:nonia@127.0.0.1:54329/nonia
RAIZ=/home/lucas/www/nonia-auth
AQUI=$(cd "$(dirname "$0")" && pwd)

for p in $(ss -ltnp 2>/dev/null | grep ":$PORT" | grep -oP 'pid=\K[0-9]+' | sort -u); do kill -9 "$p" 2>/dev/null; done
sleep 2
ss -ltn 2>/dev/null | grep -q ":$PORT" && { echo "ERRO: porta $PORT continua ocupada"; exit 1; }

cd "$RAIZ" || exit 1
node --input-type=module -e '
import pg from "pg";
const a = new pg.Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/postgres" });
await a.connect(); await a.query("DROP DATABASE IF EXISTS nonia WITH (FORCE)");
await a.query("CREATE DATABASE nonia"); await a.end();' || exit 1
DATABASE_URL="$DB" npm run db:migrate 2>&1 | grep -q "Banco de dados pronto" || { echo "ERRO: migrations"; exit 1; }

setsid env DATABASE_URL="$DB" BILLING_BYPASS=1 \
  OPENWA_URL=http://127.0.0.1:2786 OPENWA_ADMIN_KEY=admin-de-teste \
  WHATSAPP_KEY_SECRET=segredo-de-teste-com-mais-de-16 npx next dev -p "$PORT" > "$AQUI/next.log" 2>&1 < /dev/null &
for i in $(seq 1 60); do
  sleep 1
  [ "$(curl -s -o /dev/null -w %{http_code} "http://127.0.0.1:$PORT/api/health")" = "200" ] && break
done
[ "$(curl -s -o /dev/null -w %{http_code} "http://127.0.0.1:$PORT/api/health")" = "200" ] || { echo "ERRO: servidor nao subiu"; exit 1; }

# A prova: grava pela API e lê pelo banco. Health 200 não diz nada sobre QUAL banco.
E="prova-$(date +%s%N)@x.test"
curl -s -X POST "http://127.0.0.1:$PORT/api/auth/register" -H 'content-type: application/json' \
  -d "{\"organizationName\":\"Prova\",\"fullName\":\"P\",\"email\":\"$E\",\"password\":\"senha1234\"}" -o /dev/null
E="$E" node --input-type=module -e '
import pg from "pg";
const c = new pg.Client({ connectionString: "postgresql://nonia:nonia@127.0.0.1:54329/nonia" });
await c.connect();
const r = await c.query("SELECT 1 FROM users WHERE email = $1", [process.env.E]);
await c.query("DELETE FROM organizations WHERE name = $1", ["Prova"]);
await c.end();
if (r.rowCount !== 1) { console.error("ERRO: servidor esta em OUTRO banco"); process.exit(1); }
console.log("ambiente pronto: banco virgem, servidor conferido no mesmo banco");' || exit 1
