import { query } from "@/lib/db";
import { organizationId, requirePermission } from "@/lib/auth";
import { HttpError, badRequest, notFound, readJson, requireUuid } from "@/lib/http";
import { apiError } from "@/lib/records";
import * as conn from "@/lib/whatsapp/connection";
import * as inbox from "@/lib/whatsapp/inbox";
import * as openwa from "@/lib/whatsapp/openwa";
import { chatIdDoTelefone } from "@/lib/whatsapp/broadcast";

export const runtime = "nodejs";

type Conversa = { id: string; chat_id: string; wa_name: string | null; phone: string | null };

async function carregar(id: string, org: string): Promise<Conversa> {
  const { rows } = await query<Conversa>(
    `SELECT id, chat_id, wa_name, phone FROM whatsapp_conversations
      WHERE id = $1 AND organization_id = $2`,
    [id, org],
  );
  if (!rows[0]) throw notFound("Conversa não encontrada.");
  return rows[0];
}

/**
 * ENCAMINHAR uma mensagem desta conversa para outra.
 *
 * UM DESTINO POR CHAMADA, e é decisão, não simplificação. Encaminhar para
 * muitos de uma vez é envio em massa com outro nome -- e envio em massa neste
 * projeto tem teto de 500, intervalo de 3 s entre mensagens e permissão
 * própria (`whatsapp.broadcast`), justamente porque é ele que faz o número da
 * igreja ser bloqueado. Uma lista de destinos aqui daria a volta nos três de
 * uma vez, por uma rota que pede só `whatsapp.write`.
 *
 * `whatsapp.write` e não `broadcast` porque um encaminhamento é uma mensagem: o
 * teto de resposta por minuto continua valendo e é o que segura um laço.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("whatsapp.write");
    const { id } = await context.params;
    requireUuid(id, "Conversa não encontrada.");
    const org = organizationId(auth);
    const origem = await carregar(id, org);

    const payload = await readJson<{ waMessageId?: string; paraConversaId?: string; paraPersonId?: string }>(request);
    if (typeof payload.waMessageId !== "string" || !payload.waMessageId.trim()) {
      throw badRequest("Escolha a mensagem que quer encaminhar.", "message_required");
    }
    // A mensagem tem que ser DESTA conversa e DESTA igreja -- mesmo cuidado da
    // citação: o id vem da tela e não é nosso.
    const { rows: existe } = await query(
      `SELECT 1 FROM whatsapp_messages
        WHERE organization_id = $1 AND conversation_id = $2 AND wa_message_id = $3`,
      [org, id, payload.waMessageId],
    );
    if (!existe[0]) throw notFound("Mensagem não encontrada nesta conversa.");

    const destino = await resolverDestino(org, payload);

    // O mesmo teto da resposta: encaminhar é enviar, e um laço de encaminhamento
    // queima o número igual a um laço de resposta.
    await inbox.assertPodeResponder(org);

    const conexao = await conn.exigirConexao(org);
    const enviada = await openwa.encaminhar(
      conexao.sessionId, conexao.apiKey, origem.chat_id, destino.chat_id, payload.waMessageId);
    const waId = enviada.messageId ?? enviada.id ?? `local-${Date.now()}`;

    // Gravamos na conversa de DESTINO -- é lá que a mensagem aparece. O tipo
    // real (foto, áudio) só se sabe na próxima sincronização daquela conversa,
    // que corrige a linha; até lá ela conta o que aconteceu em vez de mentir
    // um texto vazio.
    await inbox.registrarEnviada(
      auth,
      { id: destino.id, organizationId: org, nome: destino.wa_name ?? destino.phone },
      { waMessageId: waId, type: "text", body: "[mensagem encaminhada]" },
      "encaminhou uma mensagem no WhatsApp",
    );

    return Response.json({ ok: true, waMessageId: waId, conversationId: destino.id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * O destino vem por conversa OU por pessoa do cadastro, nunca por telefone
 * cru: telefone digitado à mão transformaria esta rota em "mandar mensagem
 * para qualquer número", que é outra coisa e tem outro nome.
 */
async function resolverDestino(
  org: string,
  payload: { paraConversaId?: string; paraPersonId?: string },
): Promise<Conversa> {
  if (payload.paraConversaId) {
    requireUuid(payload.paraConversaId, "Conversa de destino não encontrada.");
    return carregar(payload.paraConversaId, org);
  }
  if (payload.paraPersonId) {
    requireUuid(payload.paraPersonId, "Pessoa não encontrada.");
    const { rows } = await query<{ phone: string | null; full_name: string }>(
      `SELECT phone, full_name FROM people WHERE id = $1 AND organization_id = $2`,
      [payload.paraPersonId, org],
    );
    if (!rows[0]) throw notFound("Pessoa não encontrada.");
    const digitos = (rows[0].phone ?? "").replace(/\D/g, "");
    if (!digitos) {
      throw new HttpError(
        409,
        `${rows[0].full_name} não tem telefone no cadastro, então não há para onde encaminhar.`,
        "person_without_phone",
      );
    }
    // A conversa pode ainda não existir: quem nunca escreveu para a igreja não
    // está na caixa. Criamos a linha aqui para o destino ter onde ser gravado --
    // a sincronização seguinte a preenche com nome e histórico.
    // A MESMA função do envio em massa monta o chatId. Duas regras de "como um
    // telefone brasileiro vira chat do WhatsApp" acabariam divergindo no nono
    // dígito, e aí o encaminhado iria para um número parecido.
    const chatId = chatIdDoTelefone(digitos);
    if (!chatId) {
      throw new HttpError(
        409,
        `O telefone de ${rows[0].full_name} não tem formato de número de WhatsApp.`,
        "person_without_phone",
      );
    }
    const { rows: criada } = await query<Conversa>(
      `INSERT INTO whatsapp_conversations (organization_id, chat_id, kind, phone, person_id)
       VALUES ($1, $2, 'individual', $3, $4)
       ON CONFLICT (organization_id, chat_id) DO UPDATE SET updated_at = now()
       RETURNING id, chat_id, wa_name, phone`,
      [org, chatId, digitos, payload.paraPersonId],
    );
    return criada[0];
  }
  throw badRequest("Escolha para quem encaminhar.", "forward_target_required");
}
