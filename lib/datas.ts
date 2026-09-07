/**
 * "Hoje" no fuso da igreja.
 *
 * POR QUE ISTO EXISTE. O nonia calcula "hoje" com
 * `new Date().toISOString().slice(0, 10)`, que é a data em UTC. Em Brasília
 * (UTC-3), das 21h à meia-noite, isso responde AMANHÃ. O defeito é conhecido,
 * está registrado, e NÃO é consertado por este arquivo: os dois lugares que
 * fazem essa conta continuam como estavam
 * (`components/financial-record-dialog.tsx` e o `defaultValue` de
 * `transactionDate` em `lib/models.ts`), porque mudá-los muda o que a igreja vê
 * e o que passa a ser gravado, e essa decisão não é de quem está escrevendo
 * este arquivo.
 *
 * O que este arquivo faz é impedir que uma REGRA NOVA nasça em cima do defeito.
 * A regra do lançamento retroativo é inteirinha sobre data: se o "hoje" dela
 * fosse o de UTC, ela erraria três horas por dia, justamente no horário em que
 * a secretaria lança o culto da noite -- um lançamento feito às 21h30 com a
 * data de hoje seria comparado contra amanhã e passaria a exigir a marca de
 * retroativo sem fazer nenhum sentido para quem digitou.
 *
 * O FUSO É DA IGREJA, e não uma constante. `organizations.timezone` existe
 * desde a 004 e já tem `America/Sao_Paulo` como padrão. Uma igreja em Manaus
 * ou em Rio Branco tem outro, e a regra do retroativo é sobre o dia DELA.
 */

/** Fallback quando o fuso da igreja vier vazio. É o mesmo default da 004. */
export const FUSO_PADRAO = "America/Sao_Paulo";

/**
 * O dia de hoje naquele fuso, como 'YYYY-MM-DD' -- a mesma forma de
 * `transaction_date`, que é `date` e não tem hora nenhuma para comparar.
 *
 * `en-CA` porque o formato dele já É o ISO curto; montar a string a partir das
 * partes daria o mesmo resultado com mais chance de errar o zero à esquerda.
 * Um fuso inválido vindo do banco não pode derrubar um lançamento, então cai
 * para o padrão em vez de estourar.
 */
export function hojeNoFuso(fuso: string | null | undefined, agora: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso || FUSO_PADRAO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(agora);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO_PADRAO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(agora);
  }
}

/**
 * A data do lançamento é anterior ao dia de hoje na igreja?
 *
 * Comparação de string, e ela é correta porque as duas pontas são
 * 'YYYY-MM-DD': nesse formato a ordem lexicográfica é a ordem cronológica.
 * Virar `Date` aqui seria reintroduzir fuso numa conta que não tem hora.
 *
 * ISTO NÃO DECIDE SE O LANÇAMENTO É RETROATIVO. Quem decide é quem lança, na
 * marca `retroactive`. Esta função só responde "a data é anterior a hoje", que
 * é o gatilho para EXIGIR a marca -- ver `validateFinancePayload`.
 */
export function dataEhAnteriorAHoje(data: string, fuso: string | null | undefined, agora?: Date): boolean {
  return data.slice(0, 10) < hojeNoFuso(fuso, agora);
}
