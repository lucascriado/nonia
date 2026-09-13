import { organizationId, requirePermission } from "@/lib/auth";
import { WhatsappMessage } from "@/lib/models";
import { apiError } from "@/lib/records";
import * as conn from "@/lib/whatsapp/connection";

export const runtime = "nodejs";

/**
 * A conexão de WhatsApp da igreja ATUAL.
 *
 * A sessão sai sempre de `organizationId(auth)` e nunca do payload -- é o que
 * torna impossível uma igreja operar a sessão da outra por id adivinhado. O
 * backstop é o UNIQUE em `organization_whatsapp.session_id`.
 */
export async function GET() {
  try {
    const auth = await requirePermission("whatsapp.read");
    if (!conn.whatsappDisponivel()) {
      return Response.json({ configured: false, connected: false, status: "not_configured" });
    }
    const org = organizationId(auth);
    const conexao = await conn.carregarConexao(org);
    if (!conexao) return Response.json({ configured: true, connected: false, status: "not_connected" });

    /**
     * QUANTAS MENSAGENS DE MÍDIA esta caixa tem -- e o campo existe para uma
     * frase só, a da confirmação de desconectar.
     *
     * Desconectar apaga a sessão no serviço, e com ela TODO arquivo de foto,
     * áudio e figurinha que ele guardou: o texto fica aqui, a mídia não volta
     * nem reconectando. Um aviso desses sem número é conselho; com número é
     * informação, e a diferença aparece em quem clica.
     *
     * Contado aqui e não chumbado na tela, pelo motivo de sempre: número
     * escrito à mão numa tela é um número que envelhece calado. E derivado do
     * TIPO, pelo mesmo motivo de `hasMedia` -- os bytes não estão do nosso lado
     * para serem contados.
     */
    const mediaCount = await WhatsappMessage.count({
      where: { organizationId: org, type: ["image", "video", "audio", "voice", "sticker", "document"] },
    });

    // O estado vem do OpenWA. Se ele não responder, devolvemos o último fato
    // conhecido dizendo que é o último fato conhecido -- em vez de 503 numa
    // tela que só queria mostrar um selo.
    try {
      const sessao = await conn.sincronizar(conexao);
      return Response.json({
        configured: true,
        connected: conn.conectado(sessao.status ?? ""),
        status: sessao.status,
        phone: sessao.phone ?? null,
        pushName: sessao.pushName ?? null,
        connectedAt: sessao.connectedAt ?? conexao.connectedAt,
        mediaCount,
        stale: false,
      });
    } catch {
      return Response.json({
        configured: true,
        connected: conn.conectado(conexao.status),
        status: conexao.status,
        phone: conexao.phone,
        connectedAt: conexao.connectedAt,
        mediaCount,
        stale: true,
      });
    }
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE() {
  try {
    const auth = await requirePermission("whatsapp.write");
    const conexao = await conn.exigirConexao(organizationId(auth));
    await conn.desconectar(conexao);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
