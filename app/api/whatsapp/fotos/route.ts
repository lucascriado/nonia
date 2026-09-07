import { organizationId, requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/records";
import * as conn from "@/lib/whatsapp/connection";
import * as inbox from "@/lib/whatsapp/inbox";
import { FOTOS_MAX_IDS } from "@/lib/whatsapp/openwa";

export const runtime = "nodejs";

/**
 * FOTO DE PERFIL DE UM PUNHADO DE CONVERSAS.
 *
 * ROTA SEPARADA DE PROPÓSITO. A listagem de conversas (`/api/whatsapp/conversas`)
 * já paga, dentro do próprio GET, a sincronização e a resolução de telefone --
 * uma requisição ao WhatsApp por conversa antes de a tela ter o que desenhar.
 * Pendurar foto ali empilharia mais rede na frente da lista, e foto é enfeite de
 * linha: não pode segurar a lista.
 *
 * O DESENHO DA TELA, então, é em dois tempos:
 *   1. GET /api/whatsapp/conversas  -> desenha a lista, com as INICIAIS
 *   2. GET /api/whatsapp/fotos?ids= -> troca as iniciais pelas fotos que houver
 *
 * O passo 2 pode demorar, falhar ou não vir nunca, e a tela continua correta.
 *
 * CONTRATO
 *   GET /api/whatsapp/fotos?ids=<ids separados por vírgula>
 *   -> 200 { "fotos": { "<id>": "https://..." | null }, "pedidos": n, "teto": 50 }
 *
 * `null` é resposta e não falha: não há foto, é privada, ou ainda não
 * conseguimos. Os três dão o mesmo desenho -- as iniciais.
 *
 * O `id` é o `chatId` da conversa, exatamente como a listagem o devolve. Serve
 * para conversa individual e para GRUPO: do lado do OpenWA a foto de grupo sai
 * da mesma primitiva de contato, então não há dois caminhos aqui.
 *
 * TETO DE 50 IDS, que é o do OpenWA. Acima disso os excedentes voltam `null` e
 * a tela pede de novo na próxima página -- é por isso que a resposta devolve
 * `pedidos` e `teto`: quem chama não deve descobrir o corte pela ausência.
 *
 * NUNCA DEVOLVE ERRO DE INTEGRAÇÃO. Igreja sem WhatsApp conectado, ou OpenWA
 * fora do ar, respondem 200 com o que houver em cache. A tela que chama esta
 * rota já está desenhada; um 502 aqui só teria como virar um toast avisando
 * que uns avatares não vieram, e isso não é notícia para ninguém.
 */
export async function GET(request: Request) {
  try {
    const auth = await requirePermission("whatsapp.read");
    const org = organizationId(auth);

    const ids = (new URL(request.url).searchParams.get("ids") ?? "")
      .split(",")
      .map(id => id.trim())
      .filter(Boolean);
    if (ids.length === 0) return Response.json({ fotos: {}, pedidos: 0, teto: FOTOS_MAX_IDS });

    const conexao = await conn.carregarConexao(org);
    if (!conexao) return Response.json({ fotos: {}, pedidos: ids.length, teto: FOTOS_MAX_IDS });

    const fotos = await inbox.fotosDePerfil(conexao, ids);
    return Response.json({ fotos, pedidos: ids.length, teto: FOTOS_MAX_IDS });
  } catch (error) {
    return apiError(error);
  }
}
