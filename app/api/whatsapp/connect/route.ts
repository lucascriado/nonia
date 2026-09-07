import { organizationId, requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/records";
import * as conn from "@/lib/whatsapp/connection";
import { lerQr } from "@/lib/whatsapp/openwa";

export const runtime = "nodejs";

/** Cria a sessão desta igreja e a chave restrita a ela. */
export async function POST() {
  try {
    const auth = await requirePermission("whatsapp.write");
    const conexao = await conn.conectar(organizationId(auth), auth.organization.slug);
    return Response.json({ sessionId: conexao.sessionId, status: conexao.status }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * O QR para a igreja ler.
 *
 * Vale lembrar por que esta rota existe e vai continuar existindo: o número é
 * DA IGREJA. Quando o WhatsApp cai -- e `failed` é terminal do lado do OpenWA,
 * sem reconexão automática --, alguém da igreja tem que ler o código de novo.
 * Até lá, todo envio é recusado.
 */
export async function GET() {
  try {
    const auth = await requirePermission("whatsapp.read");
    const conexao = await conn.exigirConexao(organizationId(auth));
    const sessao = await conn.sincronizar(conexao);
    if (conn.conectado(sessao.status ?? "")) {
      return Response.json({ qr: null, status: sessao.status, connected: true });
    }
    const { qr } = await lerQr(conexao.sessionId, conexao.apiKey).catch(() => ({ qr: null }));
    return Response.json({ qr: qr ?? null, status: sessao.status, connected: false });
  } catch (error) {
    return apiError(error);
  }
}
