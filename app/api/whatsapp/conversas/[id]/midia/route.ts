import { query } from "@/lib/db";
import { organizationId, requirePermission } from "@/lib/auth";
import { HttpError, badRequest, notFound, requireUuid } from "@/lib/http";
import { apiError } from "@/lib/records";
import * as conn from "@/lib/whatsapp/connection";
import * as inbox from "@/lib/whatsapp/inbox";
import * as openwa from "@/lib/whatsapp/openwa";

export const runtime = "nodejs";

/**
 * TETO DE 16 MiB, e a conta está escrita porque quem subir o número precisa
 * refazê-la.
 *
 * Dois limites diferentes se cruzam aqui, e o menor manda:
 *
 *  1. **O WhatsApp**: 16 MB para foto, áudio e vídeo. Aceitar mais só produziria
 *     uma recusa lá na frente, depois de a pessoa esperar a subida inteira.
 *  2. **O corpo que o OpenWA aceita**: `BODY_SIZE_LIMIT` é 25 MB, e nós mandamos
 *     o arquivo em **base64, que infla ~33%**. Então o arquivo real que cabe
 *     inline é ~18,7 MB. Os 16 MiB passam -- e passam por pouco. Números medidos
 *     no container em 07/09/2026, não estimados.
 *
 * Documento no WhatsApp vai a 100 MB, e mesmo assim fica no mesmo teto por ora.
 * **Reabrir por aqui se precisar de mais:** existe um segundo caminho, por URL
 * em vez de inline, que usa `MEDIA_DOWNLOAD_MAX_BYTES` (50 MB) e NÃO passa pelo
 * limite de corpo. É outro desenho -- o arquivo precisaria estar numa URL que o
 * OpenWA alcance --, não é subir esta constante.
 */
export const TETO_MIDIA_BYTES = 16 * 1024 * 1024;

/** Sobra para o envelope do multipart (fronteiras, cabeçalhos de parte, nome do arquivo). */
const MARGEM_DO_ENVELOPE = 1024 * 1024;

function arquivoGrande(bytes: number) {
  return new HttpError(
    413,
    `O arquivo tem ${(bytes / 1024 / 1024).toFixed(1)} MB e o limite é 16 MB, que é o do próprio WhatsApp.`,
    "midia_grande",
    { limite: TETO_MIDIA_BYTES },
  );
}

/**
 * QUAL ROTA DO OPENWA RECEBE O ARQUIVO sai do mimetype, nunca de um campo
 * escolhido na tela. Deixar a tela dizer "isto é uma imagem" permitiria mandar
 * um PDF pela rota de imagem, e o WhatsApp entregaria um balão de foto quebrado
 * que ninguém consegue abrir.
 */
function tipoDoArquivo(mimetype: string): openwa.TipoDeMidia | null {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  if (!mimetype || mimetype === "application/octet-stream") return null;
  return "document";
}

/** ENVIAR mídia: multipart, porque base64 em JSON inflaria 33% no nosso próprio fio. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("whatsapp.write");
    const { id } = await context.params;
    requireUuid(id, "Conversa não encontrada.");
    const org = organizationId(auth);

    const { rows } = await query<{ chat_id: string; wa_name: string | null; phone: string | null }>(
      `SELECT chat_id, wa_name, phone FROM whatsapp_conversations
        WHERE id = $1 AND organization_id = $2`,
      [id, org],
    );
    if (!rows[0]) throw notFound("Conversa não encontrada.");
    const conversa = rows[0];

    // A RECUSA VEM ANTES DE LER O CORPO, e não é economia: o Next trunca o
    // corpo no limite dele e o `formData()` estoura depois, então sem esta
    // checagem um arquivo grande demais volta como "envio incompleto" em vez
    // de "o limite é 16 MB". Além disso não faz sentido receber 20 MB na
    // memória para recusá-los em seguida.
    //
    // O `content-length` conta o multipart INTEIRO (envelope junto), então a
    // margem existe para ele não recusar um arquivo que cabe. A conferência
    // exata é a de baixo, que olha o tamanho do arquivo.
    const anunciado = Number(request.headers.get("content-length") ?? 0);
    if (anunciado > TETO_MIDIA_BYTES + MARGEM_DO_ENVELOPE) throw arquivoGrande(anunciado);

    const formulario = await lerFormulario(request);
    const arquivo = formulario.get("file");
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      throw badRequest("Escolha o arquivo antes de enviar.", "file_required");
    }
    if (arquivo.size > TETO_MIDIA_BYTES) throw arquivoGrande(arquivo.size);

    const mimetype = arquivo.type || "application/octet-stream";
    const tipo = tipoDoArquivo(mimetype);
    if (!tipo) {
      throw new HttpError(
        415,
        "Não deu para reconhecer o tipo deste arquivo, então o WhatsApp não saberia como entregá-lo.",
        "midia_nao_suportada",
      );
    }

    const legenda = textoDoCampo(formulario.get("caption"));
    if (legenda && legenda.length > 1024) {
      throw badRequest("A legenda passa de 1024 caracteres, que é o limite do WhatsApp.", "caption_too_long");
    }
    const citada = await inbox.exigirCitadaDaConversa(id, org, textoDoCampo(formulario.get("quotedWaMessageId")));
    // Nota de voz só existe em áudio: o `ptt` numa imagem seria ignorado do
    // lado de lá, e ignorar em silêncio é o que faz alguém achar que enviou uma
    // coisa e ter enviado outra.
    const voz = textoDoCampo(formulario.get("voz")) === "true" && tipo === "audio";

    await inbox.assertPodeResponder(org);

    const conexao = await conn.exigirConexao(org);
    const enviada = await openwa.enviarMidia(conexao.sessionId, conexao.apiKey, tipo, {
      chatId: conversa.chat_id,
      base64: Buffer.from(await arquivo.arrayBuffer()).toString("base64"),
      mimetype,
      filename: arquivo.name || undefined,
      caption: legenda || undefined,
      quotedMessageId: citada,
      ...(voz ? { ptt: true } : {}),
    });
    const waId = enviada.messageId ?? enviada.id ?? `local-${Date.now()}`;

    await inbox.registrarEnviada(
      auth,
      { id, organizationId: org, nome: conversa.wa_name ?? conversa.phone },
      {
        waMessageId: waId,
        // O tipo gravado é o que a TELA vai renderizar. `voice` e `audio` são
        // balões diferentes no WhatsApp, e a prévia já distingue os dois.
        type: voz ? "voice" : tipo,
        body: legenda || null,
        quotedWaMessageId: citada,
        mediaMimetype: mimetype,
        mediaFilename: arquivo.name || null,
      },
      "enviou um arquivo no WhatsApp",
    );

    return Response.json({ ok: true, waMessageId: waId, type: voz ? "voice" : tipo }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Corpo malformado vira 400 com motivo, não 500.
 *
 * É o mesmo defeito de classe que o `readJson` já consertou para JSON: um
 * `formData()` cru estoura e cai no catch genérico, e a igreja recebe "erro
 * interno" para um arquivo que o navegador cortou no meio.
 */
async function lerFormulario(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw badRequest("O envio do arquivo chegou incompleto. Tente de novo.", "invalid_form");
  }
}

function textoDoCampo(valor: FormDataEntryValue | null): string | undefined {
  return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
}
