// Erro que as rotas podem lançar para virar resposta HTTP com status próprio.
// Fica isolado de `lib/auth.ts` para que `lib/records.ts` possa tratá-lo sem
// arrastar `next/headers` (que não pode ser importado por componentes client).

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = "error",
    /** Campos extras que vão junto no corpo da resposta. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorized = (message = "Sessão expirada ou inexistente.", code = "unauthenticated") =>
  new HttpError(401, message, code);

export const forbidden = (message = "Você não tem permissão para esta ação.", code = "forbidden") =>
  new HttpError(403, message, code);

export const notFound = (message = "Registro não encontrado.", code = "not_found") =>
  new HttpError(404, message, code);

export const badRequest = (message: string, code = "invalid_payload") =>
  new HttpError(400, message, code);

export const conflict = (message: string, code = "conflict") =>
  new HttpError(409, message, code);

/**
 * Lê o corpo JSON da requisição.
 *
 * `request.json()` estoura em corpo malformado ou ausente, e sem isto o erro
 * cai no catch genérico da rota e vira 500 -- que é erro de servidor para uma
 * requisição errada do cliente. Log cheio de 500 que na verdade é o chamador
 * mandando corpo torto envenena qualquer investigação depois.
 */
export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw badRequest("Corpo da requisição inválido: esperado JSON.", "invalid_json");
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Confere que o id da URL tem forma de uuid antes de ir ao banco.
 *
 * Sem isto, um id torto chega ao Postgres e volta como
 * "invalid input syntax for type uuid", que o catch genérico transforma em
 * 500 -- erro de servidor para um endereço que o cliente inventou.
 *
 * Responde 404, e não 400, de propósito: um id malformado não pode ser um
 * registro desta organização, e é exatamente a mesma situação que um uuid
 * válido inexistente. Do lado de quem usa, as duas são "esse registro não
 * existe", e a tela trata uma coisa só em vez de duas.
 */
export function requireUuid(valor: string | null | undefined, mensagem = "Registro não encontrado."): string {
  if (!valor || !UUID.test(valor)) throw notFound(mensagem);
  return valor;
}
