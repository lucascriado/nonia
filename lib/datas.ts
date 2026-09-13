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

/**
 * ARITMÉTICA DE DATA, em cima de 'YYYY-MM-DD' e sem fuso nenhum.
 *
 * O fuso entra UMA VEZ, em `hojeNoFuso`, para responder "que dia é hoje na
 * igreja". Dali em diante a conta é sobre um dia do calendário, que não tem
 * hora e portanto não tem fuso -- e é isso que as funções abaixo preservam.
 *
 * Por que UTC aqui dentro, num arquivo que existe para fugir de UTC: porque a
 * string não tem hora, e ler e escrever pelos acessores UTC é o único jeito de
 * a conta não passar por fuso nenhum. `new Date("2026-09-06")` seguido de
 * `getDay()` mistura os dois -- interpreta como meia-noite UTC e devolve o dia
 * da semana no fuso da MÁQUINA, que em Brasília é o dia anterior às 21h. É
 * exatamente esse par que fazia o `nextSunday()` dos ministérios errar.
 */
function comoUtc(data: string): Date {
  const [ano, mes, dia] = data.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const formatarUtc = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

/** Dia da semana de uma data 'YYYY-MM-DD'. 0 = domingo. */
export function diaDaSemana(data: string): number {
  return comoUtc(data).getUTCDay();
}

/** Soma dias a uma data 'YYYY-MM-DD'. Vira mês e ano sozinho. */
export function somarDias(data: string, dias: number): string {
  const d = comoUtc(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return formatarUtc(d);
}

/**
 * O mês de uma data 'YYYY-MM-DD', como intervalo semiaberto [início, fim).
 *
 * `fim` é o dia 1º do mês SEGUINTE, e a comparação é `< fim`: assim o último
 * dia do mês entra sem ninguém precisar saber se o mês tem 28, 30 ou 31 dias.
 */
export function mesDe(data: string): { inicio: string; fim: string } {
  const d = comoUtc(data);
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { inicio: formatarUtc(inicio), fim: formatarUtc(fim) };
}

/**
 * O próximo domingo a partir de hoje NA IGREJA -- e hoje, se hoje já é domingo.
 *
 * É a data que a chamada de ministério sugere. O domingo é o dia de reunião da
 * maioria delas, e sugerir o domingo errado é dado errado: a chamada nasce
 * numa data em que ninguém se reuniu, e a do dia certo fica sem registro.
 */
export function proximoDomingo(fuso: string | null | undefined, agora?: Date): string {
  const hoje = hojeNoFuso(fuso, agora);
  const dia = diaDaSemana(hoje);
  return dia === 0 ? hoje : somarDias(hoje, 7 - dia);
}

/** Deslocamento do fuso naquele instante, em ms (Brasília: -3h). */
function deslocamentoNoFuso(fuso: string, instante: number): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instante));
  const v = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  const relogio = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  // O instante sem os milissegundos: o relógio formatado não os tem.
  return relogio - Math.floor(instante / 1000) * 1000;
}

/**
 * O INSTANTE em que o dia 'YYYY-MM-DD' começa naquele fuso -- a meia-noite
 * LOCAL da igreja, como `Date`.
 *
 * É o que o painel fazia no SQL com `(data::date)::timestamp AT TIME ZONE fuso`,
 * e existe para comparar uma data solta com coluna timestamptz. Brasília:
 * meiaNoiteNoFuso("2026-09-12", "America/Sao_Paulo") = 2026-09-12T03:00:00Z.
 *
 * A ARMADILHA que isto evita é a mesma do SQL: `new Date("2026-09-12")` é a
 * meia-noite em UTC, que em Brasília é 21h do dia ANTERIOR -- e o "a partir de
 * hoje" passaria a incluir o evento de ontem à noite.
 *
 * Na virada de horário de verão, segue o Postgres: meia-noite que não existe
 * (o relógio pulou) usa o deslocamento de ANTES da virada; meia-noite que
 * acontece duas vezes fica com a de DEPOIS. Nos dois casos é o instante mais
 * tardio entre os candidatos. Fuso inválido cai para o padrão, como em
 * `hojeNoFuso`.
 */
export function meiaNoiteNoFuso(data: string, fuso: string | null | undefined): Date {
  let zona = fuso || FUSO_PADRAO;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona });
  } catch {
    zona = FUSO_PADRAO;
  }
  const relogio = comoUtc(data).getTime();
  const DIA = 86_400_000;
  // Os deslocamentos possíveis em volta do dia: numa virada, os dois lados dela.
  const deslocamentos = new Set(
    [relogio - DIA, relogio, relogio + DIA].map((t) => deslocamentoNoFuso(zona, t)),
  );
  const candidatos = [...deslocamentos].map((d) => relogio - d);
  const validos = candidatos.filter((c) => c + deslocamentoNoFuso(zona, c) === relogio);
  return new Date(Math.max(...(validos.length ? validos : candidatos)));
}
