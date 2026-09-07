import { organizationId, requirePermission } from "@/lib/auth";
import { paginacao } from "@/lib/listings";
import { apiError } from "@/lib/records";
import * as envio from "@/lib/whatsapp/broadcast";

export const runtime = "nodejs";

/**
 * QUEM EXATAMENTE VAI RECEBER, com nome e telefone.
 *
 * Palavras do Lucas sobre o disparo: "a gnt tem x numeros mas eu quero escolher
 * esses numeros parece q tá meio no escuro". "No escuro" é descrição literal do
 * que existia: a tela dizia "de 213 pessoas, 187 têm telefone" e o botão
 * alcançava dezenas de pessoas que ninguém nunca viu. Ação irreversível de alvo
 * invisível -- e mensagem enviada não volta, não há lixeira para isto.
 *
 * A resolução é a MESMA do envio, `candidatos()`, e isso não é reuso por
 * economia: prévia e envio calculados por caminhos diferentes seriam duas
 * verdades que concordam até o dia em que alguém mexe numa delas. É o mesmo
 * motivo pelo qual listagem e exportação passaram a tirar o filtro de
 * `lib/listings.ts`.
 *
 * `whatsapp.broadcast` e não `whatsapp.read`: enumerar o alvo de um disparo é
 * parte do disparo. Quem não pode disparar não tem por que pedir a lista.
 *
 * QUEM NÃO RECEBE APARECE IGUAL, com o motivo ao lado -- nunca sumindo. Nome que
 * desaparece sem explicação faz a pessoa procurar o que não está lá; com o
 * motivo, ela vê "a Maria não tem telefone" e vai cadastrar o telefone.
 */
export async function GET(request: Request) {
  try {
    const auth = await requirePermission("whatsapp.broadcast");
    const { searchParams } = new URL(request.url);
    const org = organizationId(auth);

    const audience = searchParams.get("audience") ?? "members";
    if (audience !== "members" && audience !== "visitors") {
      return Response.json({ error: "Público inválido.", code: "invalid_audience" }, { status: 400 });
    }

    // Os MESMOS parâmetros da listagem, lidos do mesmo lugar: a tela manda a
    // query string que ela já tem, sem traduzir nada.
    const lista = await envio.candidatos(audience, searchParams, org);
    const resumo = envio.conferir(lista);

    // Paginado sobre a lista JÁ RESOLVIDA, e não por uma segunda consulta com
    // OFFSET: uma segunda consulta poderia devolver um conjunto diferente (o
    // cadastro muda entre uma página e outra) e a pessoa conferiria uma lista
    // que nunca existiu inteira. São no máximo 500 linhas -- o teto do envio.
    const alvos = lista.slice(0, envio.TETO_POR_ENVIO);
    const { page, pageSize, offset } = paginacao(searchParams);

    return Response.json({
      records: alvos.slice(offset, offset + pageSize).map((c) => ({
        personId: c.id,
        name: c.name,
        phone: c.phone,
        recebe: c.recebe,
        motivo: c.motivo,
      })),
      total: alvos.length,
      page,
      pageSize,
      // Byte a byte o mesmo objeto que `preview: true` já devolve: a tela que
      // mostra os números não reaprende nada por causa da que mostra os nomes.
      resumo,
    });
  } catch (error) {
    return apiError(error);
  }
}
