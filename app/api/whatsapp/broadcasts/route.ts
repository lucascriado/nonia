import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { badRequest, readJson } from "@/lib/http";
import { apiError } from "@/lib/records";
import { paginacao } from "@/lib/listings";
import * as conn from "@/lib/whatsapp/connection";
import * as envio from "@/lib/whatsapp/broadcast";
import { QueryTypes } from "sequelize";

export const runtime = "nodejs";

type Payload = {
  audience?: string;
  message?: string;
  filters?: Record<string, string>;
  preview?: boolean;
  incluir?: unknown;
};

const publicoValido = (v: unknown): v is envio.Publico => v === "members" || v === "visitors";

/**
 * A LISTA EXPLÍCITA DE DESTINATÁRIOS -- e o motivo dela NÃO é "permitir
 * escolher na tela". É este, e ele é a razão de o campo existir:
 *
 * Sem `incluir`, a prévia e o envio são DUAS RESOLUÇÕES EM MOMENTOS DIFERENTES.
 * A tela pergunta "quem casa com este filtro?", mostra os nomes, a pessoa
 * confere um por um e aperta enviar -- e aí o servidor pergunta a MESMA coisa
 * de novo, agora. Entre as duas perguntas alguém pode ter sido cadastrado, ou
 * ganhado um telefone. Medido em 07/09/2026: a prévia devolveu 5 pessoas, um
 * cadastro novo entrou, e o envio criou para 6.
 *
 * Com números na tela isso é invisível. Com NOMES vira "eu vi cinco nomes,
 * conferi um por um, e mandou para seis" -- que é PIOR que o escuro de antes,
 * porque cria uma confiança nova e depois a quebra com o próprio produto.
 *
 * Por isso `incluir` não é conveniência de interface, e "simplificar" mandando
 * só o filtro REABRE a janela -- calada, do jeito que ela já era. Se um dia
 * alguém for tirar este campo: a pergunta a responder antes é "o que foi visto
 * e o que é enviado continuam sendo a mesma lista?".
 *
 * Ele NÃO precisa casar com o filtro. Público montado à mão é permitido e passa
 * pelo mesmo teto de 500, pelo mesmo intervalo entre mensagens e pela mesma
 * permissão `whatsapp.broadcast` -- a proteção do número não pode depender de o
 * público ter vindo de um filtro.
 */
function lerIncluir(valor: unknown): string[] | null {
  if (valor === undefined || valor === null) return null;
  if (!Array.isArray(valor) || valor.some((v) => typeof v !== "string")) {
    throw badRequest("A lista de destinatários escolhidos veio em formato inválido.", "invalid_selection");
  }
  const ids = [...new Set(valor as string[])];
  if (!ids.length) {
    throw badRequest("Nenhum destinatário foi escolhido.", "no_recipients_selected");
  }
  return ids;
}

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("whatsapp.read");
    const { searchParams } = new URL(request.url);
    const { page, pageSize, offset } = paginacao(searchParams);
    const org = organizationId(auth);

    const contagem = await query<{ total: number }>(
      `SELECT count(*)::int AS total FROM whatsapp_broadcasts WHERE organization_id = $1`, [org],
    );
    const { rows } = await query(
      `SELECT b.id, b.message, b.audience, b.status, b.total,
              b.started_at AS "startedAt", b.finished_at AS "finishedAt", b.created_at AS "createdAt",
              u.full_name AS "createdBy",
              -- Contadas aqui, não guardadas na linha do envio: contador gravado
              -- envelhece calado, e a tela leria "0 pulados" com gente pulada.
              c.sent AS "sentCount", c.failed AS "failedCount", c.skipped AS "skippedCount", c.pending AS "pendingCount"
         FROM whatsapp_broadcasts b
         LEFT JOIN users u ON u.id = b.created_by
         LEFT JOIN LATERAL (
           SELECT count(*) FILTER (WHERE status = 'sent')::int    AS sent,
                  count(*) FILTER (WHERE status = 'failed')::int  AS failed,
                  count(*) FILTER (WHERE status = 'skipped')::int AS skipped,
                  count(*) FILTER (WHERE status = 'pending')::int AS pending
             FROM whatsapp_broadcast_recipients r WHERE r.broadcast_id = b.id
         ) c ON true
        WHERE b.organization_id = $1
        ORDER BY b.created_at DESC
        LIMIT $2 OFFSET $3`,
      [org, pageSize, offset],
    );
    return Response.json({ records: rows, total: contagem.rows[0].total, page, pageSize });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Cria o envio -- ou, com `preview: true`, só confere.
 *
 * A conferência é o ponto: ela responde ANTES de qualquer mensagem sair quantas
 * pessoas o filtro alcança, quantas têm telefone e quanto tempo aquilo leva.
 * Quem não tem telefone não é falha: é ausência, e ausência informada antes
 * vale mais que erro depois.
 */
export async function POST(request: Request) {
  try {
    // `whatsapp.broadcast` é permissão própria de propósito: responder UMA
    // conversa e disparar para QUINHENTAS pessoas não têm o mesmo peso, e
    // mensagem enviada não volta -- não há lixeira para isto.
    const auth = await requirePermission("whatsapp.broadcast");
    const payload = await readJson<Payload>(request);
    const org = organizationId(auth);

    const audience = payload.audience ?? "members";
    if (!publicoValido(audience)) {
      return Response.json({ error: "Público inválido.", code: "invalid_audience" }, { status: 400 });
    }
    const params = new URLSearchParams(payload.filters ?? {});
    const escolhidos = lerIncluir(payload.incluir);
    const lista = escolhidos
      ? await envio.porIds(audience, escolhidos, org)
      : await envio.candidatos(audience, params, org, auth.organization.timezone);
    const conferencia = envio.conferir(lista);

    if (payload.preview) return Response.json({ preview: conferencia });

    const mensagem = envio.exigirMensagem(payload.message);
    // A conexão é exigida ANTES de gravar: criar um envio para uma igreja sem
    // WhatsApp conectado geraria uma linha que nunca sai do lugar.
    await conn.exigirConexao(org);
    if (!conferencia.comTelefone) {
      return Response.json(
        {
          error: "Nenhuma das pessoas selecionadas tem telefone cadastrado, então não há para quem enviar.",
          code: "no_recipients",
          details: conferencia,
        },
        { status: 400 },
      );
    }

    const alvos = lista.slice(0, envio.TETO_POR_ENVIO);
    const id = await db.transaction(async (transaction) => {
      const criado = await db.query<{ id: string }>(
        `INSERT INTO whatsapp_broadcasts (organization_id, created_by, message, audience, filters, total)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
        {
          // `filters` continua sendo gravado mesmo com lista explícita: ele deixa
          // de decidir QUEM recebe e passa a registrar DE ONDE a lista veio,
          // que é o que o histórico precisa para explicar um envio antigo.
          bind: [org, auth.user.id, mensagem, audience, JSON.stringify(payload.filters ?? {}), alvos.length],
          transaction,
          type: QueryTypes.SELECT,
        },
      );
      const broadcastId = criado[0].id;

      // Uma linha por pessoa, inclusive quem NÃO tem telefone: ela entra como
      // `skipped`. Quem ficou de fora tem que aparecer com nome na tela -- do
      // contrário "enviei para 214" viraria mentira sem ninguém notar.
      for (const alvo of alvos) {
        await db.query(
          `INSERT INTO whatsapp_broadcast_recipients
             (broadcast_id, organization_id, person_id, name, phone, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          {
            // `recebe` e não `chatId`: quem foi pulado por número repetido TEM
            // chatId válido, e mandar para ele seria a segunda mensagem ao
            // mesmo aparelho -- o padrão de robô que a deduplicação existe para
            // impedir. A linha fica, com status `skipped`, para o nome aparecer
            // no histórico em vez de sumir.
            bind: [broadcastId, org, alvo.id, alvo.name, alvo.phone, alvo.recebe ? "pending" : "skipped"],
            transaction,
          },
        );
      }
      await addActivity(transaction, auth, "whatsapp", "disparou mensagem no WhatsApp", `${conferencia.comTelefone} pessoas`);
      return broadcastId;
    });

    return Response.json({ id, ...conferencia }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
