import { LockKeyhole, RefreshCw, TriangleAlert } from "lucide-react";

/**
 * Erro de leitura que CARREGA O STATUS. Sem ele o `catch` de uma listagem sabe
 * que falhou e não sabe por quê, e 403 vira "não foi possível carregar" - que
 * manda a pessoa tentar de novo para sempre em algo que nunca vai dar certo.
 */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * A listagem NÃO carregou. É outra coisa que "a igreja não tem registro", e
 * confundir as duas foi um defeito de verdade: com o papel de leitura numa
 * igreja, abrir /financeiro pela URL mostrava "Nenhum lançamento ainda -
 * registre dízimos e ofertas". A igreja podia ter mil lançamentos; o que houve
 * foi um 403. Estado vazio só pode aparecer depois de uma leitura que deu
 * certo, senão ele afirma sobre o dado da igreja uma coisa que ninguém leu.
 *
 * 403 tem texto próprio porque tem causa e saída próprias: não é falha, é o
 * papel da pessoa NESTA igreja - e quem tem mais de uma chega aqui justamente
 * depois de trocar.
 */
export function LoadFailure({ status, onRetry }: { status: number; onRetry?: () => void }) {
  const denied = status === 403;
  return (
    <section className="first-run">
      <span aria-hidden>{denied ? <LockKeyhole /> : <TriangleAlert />}</span>
      <h3>{denied ? "Você não tem acesso a esta área" : "Não foi possível carregar"}</h3>
      <p>
        {denied
          ? "Seu papel nesta igreja não alcança esta tela. Se você participa de mais de uma igreja, confira no seletor se está na igreja certa."
          : "A lista não pôde ser carregada agora. Isso costuma ser conexão; tente de novo em instantes."}
      </p>
      {!denied && onRetry && (
        <button className="primary-action" onClick={onRetry} type="button"><RefreshCw />Tentar de novo</button>
      )}
    </section>
  );
}
