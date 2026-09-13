import { Op } from "sequelize";
import { organizationId, requirePermission } from "@/lib/auth";
import { notFound, readJson, requireUuid } from "@/lib/http";
import { Person, WhatsappContact, WhatsappConversation, WhatsappMessage } from "@/lib/models";
import { apiError } from "@/lib/records";
import { assertBelongsToOrganization } from "@/lib/tenant";
import * as conn from "@/lib/whatsapp/connection";
import * as inbox from "@/lib/whatsapp/inbox";
import * as openwa from "@/lib/whatsapp/openwa";

export const runtime = "nodejs";

type Conversa = {
  id: string; chatId: string; kind: string; phone: string | null;
  personId: string | null; waName: string | null; syncCursor: string | null;
};

async function carregar(id: string, org: string): Promise<Conversa> {
  const conversa = await WhatsappConversation.findOne({
    attributes: ["id", "chatId", "kind", "phone", "personId", "waName", "syncCursor"],
    where: { id, organizationId: org },
    raw: true,
  });
  // 404 e não 403: confirmar que o id existe já contaria algo sobre a outra igreja.
  if (!conversa) throw notFound("Conversa não encontrada.");
  return conversa;
}

/** A conversa e as mensagens dela. Abrir é o que sincroniza. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("whatsapp.read");
    const { id } = await context.params;
    requireUuid(id, "Conversa não encontrada.");
    const org = organizationId(auth);
    const conversa = await carregar(id, org);

    // "Trazer mais" é SOB DEMANDA e nunca automático: acima de 100 a rota do
    // OpenWA exige `deep`, que ela mesma avisa aumentar o risco de o WhatsApp
    // limitar a conta. Puxar fundo sozinho, a cada abertura, gastaria esse
    // risco sem ninguém ter pedido.
    const fundo = new URL(request.url).searchParams.get("deep") === "true";

    let sincronizou = true;
    try {
      const conexao = await conn.exigirConexao(org);
      await inbox.sincronizarMensagens(
        conexao, conversa.id, conversa.chatId, conversa.syncCursor, fundo ? 500 : undefined);
      await openwa.marcarLida(conexao.sessionId, conexao.apiKey, conversa.chatId).catch(() => undefined);
      // Só em grupo: em conversa individual o remetente é a própria conversa, e
      // `author` vem vazio -- medido, 0 de 45. Pedir nome ali seria uma
      // requisição de rede garantidamente inútil.
      if (conversa.kind === "group") {
        await inbox.resolverNomesDeAutores(conexao, conversa.id).catch(() => undefined);
      }
      // `silent`: zerar o não-lido nunca mexeu em updated_at.
      await WhatsappConversation.update(
        { unreadCount: 0 },
        { where: { id, organizationId: org }, silent: true },
      );
    } catch {
      sincronizou = false;
    }

    const mensagens = await WhatsappMessage.findAll({
      attributes: [
        "id", "waMessageId", "fromMe", "author", "authorName", "type", "body", "sentAt",
        "mediaMimetype", "mediaFilename", "quotedWaMessageId",
      ],
      // Aviso do WhatsApp não é mensagem de gente. Ver tipoParaGuardar().
      where: { conversationId: id, organizationId: org, type: { [Op.ne]: "system" } },
      order: [["sentAt", "ASC"], ["id", "ASC"]],
      raw: true,
    });

    // A prévia da CITADA sai da própria tabela, e não de uma cópia guardada na
    // linha de quem cita: cópia divergiria no dia em que a original fosse
    // editada ou apagada. Procurada na igreja inteira pelo id, como sempre foi.
    const idsCitados = [...new Set(mensagens.map((m) => m.quotedWaMessageId).filter((q): q is string => q !== null))];
    const citadas = new Map(
      idsCitados.length
        ? (await WhatsappMessage.findAll({
            attributes: ["waMessageId", "type", "body"],
            where: { organizationId: org, waMessageId: idsCitados },
            raw: true,
          })).map((q) => [q.waMessageId, q])
        : [],
    );

    // O nome gravado na mensagem só existe quando ela chegou pelo evento AO VIVO
    // (é de lá que vem o notifyName). No histórico ele é sempre nulo -- 655 de
    // 655 --, e aí quem responde é a tabela de contatos, resolvida sob demanda.
    const autores = [...new Set(mensagens.map((m) => m.author).filter((a): a is string => a !== null))];
    const nomesDeContato = new Map(
      autores.length
        ? (await WhatsappContact.findAll({
            attributes: ["waId", "name"],
            where: { organizationId: org, waId: autores },
            raw: true,
          })).map((c) => [c.waId, c.name])
        : [],
    );

    const rows = mensagens.map((m) => {
      const citada = m.quotedWaMessageId !== null ? citadas.get(m.quotedWaMessageId) : undefined;
      return {
        ...m,
        authorName: m.authorName ?? (m.author !== null ? nomesDeContato.get(m.author) ?? null : null),
        quotedType: citada?.type ?? null,
        quotedBody: citada?.body ?? null,
      };
    });

    // CONTADOS, e não sumidos em silêncio: numa conversa medida na conta real,
    // 155 das 155 linhas eram avisos. Sem este número, a tela mostraria uma
    // conversa vazia para um chat que o Lucas vê cheio no celular -- que é o
    // vazio que mente, com outra roupa.
    const avisosIgnorados = await WhatsappMessage.count({
      where: { conversationId: id, organizationId: org, type: "system" },
    });

    const atual = await WhatsappConversation.findOne({
      attributes: ["id", "chatId", "kind", "phone", "personId", "waName", "syncCursor"],
      where: { id, organizationId: org },
      raw: true,
    });
    const nomeDoCadastro = atual?.personId
      ? (await Person.findOne({ attributes: ["fullName"], where: { id: atual.personId, organizationId: org }, raw: true }))
        ?.fullName ?? null
      : null;
    const cab = atual
      ? {
          id: atual.id,
          chatId: atual.chatId,
          kind: atual.kind,
          phone: atual.phone,
          personId: atual.personId,
          // Se a pessoa está cadastrada, o nome DELA ganha do nome do WhatsApp.
          name: nomeDoCadastro ?? atual.waName,
          naoIdentificado: nomeDoCadastro === null,
          synced: atual.syncCursor !== null,
        }
      : undefined;

    // O topo da conversa NÃO pode parecer o começo dela quando não é.
    // Trouxemos as N mais recentes; se vieram N cheias, há mais atrás, e a tela
    // precisa dizer isso -- conversa que parece nascer do nada é irmã do vazio
    // que mente.
    const podeHaverMais = rows.length >= (fundo ? 500 : 100);

    return Response.json({
      ...cab,
      hasMore: podeHaverMais,
      deep: fundo,
      avisosIgnorados,
      // A prévia vem calculada daqui, e não da tela: mídia vira marcador de
      // texto ("[foto]") em vez de linha vazia, e o cálculo mora num lugar só.
      messages: rows.map((m) => {
        const linha = m as unknown as {
          id: string; fromMe: boolean; sentAt: string;
          author: string | null; authorName: string | null;
          waMessageId: string; type: string; body: string | null;
          mediaMimetype: string | null; mediaFilename: string | null;
          quotedWaMessageId: string | null; quotedType: string | null; quotedBody: string | null;
        };
        // DERIVADO do tipo, nunca lido de coluna: a `has_media` da 015 gravava
        // false para toda mensagem (o histórico é pedido sem mídia de
        // propósito), e quem lesse acreditaria. Ver a 016.
        const kind = inbox.midiaDoTipo(linha.type);
        // MONTADO CAMPO A CAMPO, e não com `...linha`, de propósito: o spread
        // levava junto as colunas cruas do JOIN (`mediaMimetype`,
        // `quotedWaMessageId`, `quotedType`, `quotedBody`), então a resposta
        // carregava os MESMOS dados com dois nomes. Duas versões do mesmo campo
        // é como um contrato deixa de ser contrato: quem lê não sabe qual das
        // duas vale, e as duas passam a ter que ser mantidas.
        return {
          id: linha.id,
          waMessageId: linha.waMessageId,
          fromMe: linha.fromMe,
          author: linha.author,
          authorName: linha.authorName,
          type: linha.type,
          body: linha.body,
          sentAt: linha.sentAt,
          preview: inbox.previa(linha.type, linha.body),
          hasMedia: kind !== null,
          media: kind
            ? {
                // A URL é do NONIA, não do OpenWA: o navegador chega nela com o
                // cookie de sessão normal e a chave do OpenWA nunca sai daqui.
                url: `/api/whatsapp/conversas/${id}/midia/${encodeURIComponent(linha.waMessageId)}`,
                mimetype: linha.mediaMimetype,
                filename: linha.mediaFilename,
                kind,
              }
            : null,
          quoted: linha.quotedWaMessageId
            ? {
                waMessageId: linha.quotedWaMessageId,
                // Citada que ainda não foi sincronizada não vira null nem some:
                // o balão diz que há uma citação e que o texto dela não veio.
                preview: linha.quotedType
                  ? inbox.previa(linha.quotedType, linha.quotedBody)
                  : "[mensagem fora do trecho carregado]",
              }
            : null,
        };
      }),
      stale: !sincronizou,
    });
  } catch (error) {
    return apiError(error);
  }
}

/** RESPONDER. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("whatsapp.write");
    const { id } = await context.params;
    requireUuid(id, "Conversa não encontrada.");
    const org = organizationId(auth);
    const conversa = await carregar(id, org);
    const payload = await readJson<{ message?: string; quotedWaMessageId?: string }>(request);
    const texto = inbox.exigirTexto(payload.message);
    // A citada tem que ser DESTA conversa. Sem essa checagem, um id de outra
    // conversa (ou de outra igreja) iria direto para o WhatsApp, e o vazamento
    // seria por citação -- a mensagem citada aparece dentro do balão enviado.
    const citada = await inbox.exigirCitadaDaConversa(id, org, payload.quotedWaMessageId);

    // Teto de sanidade: pega automação, não gente. Ver lib/whatsapp/inbox.ts.
    await inbox.assertPodeResponder(org);

    const conexao = await conn.exigirConexao(org);
    const enviada = await openwa.enviarTexto(conexao.sessionId, conexao.apiKey, conversa.chatId, texto, citada);
    const waId = enviada.messageId ?? enviada.id ?? `local-${Date.now()}`;

    await inbox.registrarEnviada(
      auth,
      { id, organizationId: org, nome: conversa.waName ?? conversa.phone },
      { waMessageId: waId, type: "text", body: texto, quotedWaMessageId: citada },
      citada ? "respondeu citando no WhatsApp" : "respondeu no WhatsApp",
    );

    return Response.json({ ok: true, waMessageId: waId }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

/** Vincular a conversa a uma pessoa do cadastro (ou desvincular com null). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("whatsapp.write");
    const { id } = await context.params;
    requireUuid(id, "Conversa não encontrada.");
    const org = organizationId(auth);
    await carregar(id, org);
    const payload = await readJson<{ personId?: string | null }>(request);

    if (payload.personId) {
      await assertBelongsToOrganization("people", "id", payload.personId, org);
    }
    await WhatsappConversation.update(
      { personId: payload.personId ?? null },
      { where: { id, organizationId: org } },
    );
    return Response.json({ ok: true, personId: payload.personId ?? null });
  } catch (error) {
    return apiError(error);
  }
}
