// Erro que as rotas podem lançar para virar resposta HTTP com status próprio.
// Fica isolado de `lib/auth.ts` para que `lib/records.ts` possa tratá-lo sem
// arrastar `next/headers` (que não pode ser importado por componentes client).

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code: string = "error") {
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
