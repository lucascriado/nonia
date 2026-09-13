import type { InferAttributes } from "sequelize";
import { organizationId, requirePermission } from "@/lib/auth";
import { HttpError, badRequest, notFound, readJson, requireUuid } from "@/lib/http";
import { Person, WhatsappConversation, WhatsappMessage } from "@/lib/models";
import { apiError } from "@/lib/records";
import * as conn from "@/lib/whatsapp/connection";
import * as inbox from "@/lib/whatsapp/inbox";
import * as openwa from "@/lib/whatsapp/openwa";
import { chatIdDoTelefone } from "@/lib/whatsapp/broadcast";

export const runtime = "nodejs";

type Conversa = { id: string; chatId: string; waName: string | null; phone: string | null };

async function carregar(id: string, org: string): Promise<Conversa> {
  const conversa = await WhatsappConversation.findOne({
    attributes: ["id", "chatId", "waName", "phone"],
    where: { id, organizationId: org },
    raw: true,
  });
  if (!conversa) throw notFound("Conversa não encontrada.");
  return conversa;
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
    const existe = await WhatsappMessage.findOne({
      attributes: ["id"],
      where: { organizationId: org, conversationId: id, waMessageId: payload.waMessageId },
      raw: true,
    });
    if (!existe) throw notFound("Mensagem não encontrada nesta conversa.");

    const destino = await resolverDestino(org, payload);

    // O mesmo teto da resposta: encaminhar é enviar, e um laço de encaminhamento
    // queima o número igual a um laço de resposta.
    await inbox.assertPodeResponder(org);

    const conexao = await conn.exigirConexao(org);
    const enviada = await openwa.encaminhar(
      conexao.sessionId, conexao.apiKey, origem.chatId, destino.chatId, payload.waMessageId);
    const waId = enviada.messageId ?? enviada.id ?? `local-${Date.now()}`;

    // Gravamos na conversa de DESTINO -- é lá que a mensagem aparece. O tipo
    // real (foto, áudio) só se sabe na próxima sincronização daquela conversa,
    // que corrige a linha; até lá ela conta o que aconteceu em vez de mentir
    // um texto vazio.
    await inbox.registrarEnviada(
      auth,
      { id: destino.id, organizationId: org, nome: destino.waName ?? destino.phone },
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
    const pessoa = await Person.findOne({
      attributes: ["phone", "fullName"],
      where: { id: payload.paraPersonId, organizationId: org },
      raw: true,
    });
    if (!pessoa) throw notFound("Pessoa não encontrada.");
    const digitos = (pessoa.phone ?? "").replace(/\D/g, "");
    if (!digitos) {
      throw new HttpError(
        409,
        `${pessoa.fullName} não tem telefone no cadastro, então não há para onde encaminhar.`,
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
        `O telefone de ${pessoa.fullName} não tem formato de número de WhatsApp.`,
        "person_without_phone",
      );
    }
    // Se a conversa já existe pelo par (igreja, chat), NADA dela é trocado --
    // só `updated_at` --, e o que volta é a linha que já estava lá.
    const [criada] = await WhatsappConversation.bulkCreate(
      [{ organizationId: org, chatId, kind: "individual", phone: digitos, personId: payload.paraPersonId }],
      {
        conflictAttributes: ["organizationId", "chatId"],
        // `updated_at` é o nome do ATRIBUTO do timestamp (a opção `updatedAt` do
        // Model o nomeia), e o tipo do Sequelize só conhece os declarados.
        updateOnDuplicate: ["updated_at"] as string[] as (keyof InferAttributes<WhatsappConversation>)[],
        returning: true,
      },
    );
    return { id: criada.id, chatId: criada.chatId, waName: criada.waName, phone: criada.phone };
  }
  throw badRequest("Escolha para quem encaminhar.", "forward_target_required");
}
