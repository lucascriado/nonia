import { query } from "@/lib/db";
import { hojeNoFuso, FUSO_PADRAO } from "@/lib/datas";

/**
 * KARDEX -- o extrato do financeiro em ordem, com saldo corrente linha a linha.
 *
 * NÃO TEM MIGRATION. É leitura e apresentação em cima das
 * `financial_transactions` que já existem. Chegou a existir aqui uma tabela de
 * contas, porque o pedido falava em "extrato por conta/carteira"; foi
 * descartada em 07/09/2026, quando o Lucas confirmou que "carteira" é só como
 * ele chama a TELA do financeiro. Não há conta, caixa nem carteira no domínio,
 * e o kardex é o extrato do razão único da igreja.
 *
 * O QUE UM KARDEX TEM QUE O EXTRATO DA TELA NÃO TEM:
 *
 *  1. ORDEM CRESCENTE. A listagem de /financeiro é decrescente, porque quem
 *     abre a tela quer o que acabou de acontecer. Um saldo corrente só existe
 *     na ordem em que o dinheiro se moveu -- de trás para a frente, cada linha
 *     mostraria um saldo que ainda não tinha acontecido.
 *  2. SALDO ANTERIOR. Sem ele o extrato de setembro começaria em zero e todas
 *     as linhas mostrariam um saldo errado, que continua parecendo certo. É a
 *     linha que torna o período auto-suficiente para quem imprime.
 *  3. ORDEM DETERMINÍSTICA. Duas impressões do mesmo período têm que sair
 *     iguais. `transaction_date` empata o tempo todo -- um domingo de culto tem
 *     dez lançamentos na mesma data --, então o desempate é `created_at` e
 *     depois `id`. Sem o desempate, o saldo linha a linha mudaria de uma
 *     impressão para a outra, com o mesmo total no pé: o pior tipo de defeito,
 *     porque a conferência bate e o papel não.
 *
 * SÓ ENTRA O QUE JÁ ACONTECEU: `status = 'paid'` e não excluído. Pendente é
 * conta a pagar, não movimento -- somá-lo no saldo corrente diria que a igreja
 * tem um dinheiro que ainda não saiu nem entrou. O total dos pendentes do
 * período vai à parte, para quem imprime saber que eles existem.
 */

/** Sinal do lançamento no saldo. Entrada soma, saída subtrai. */
const MOVIMENTO = "CASE WHEN type = 'income' THEN amount ELSE -amount END";

/**
 * Teto de linhas, e ele RECUSA em vez de cortar.
 *
 * Kardex truncado é a pior saída possível: as linhas que sobram continuam com
 * saldo corrente coerente entre si, o papel parece certo, e faltam lançamentos.
 * Preferimos a recusa que diz o que fazer -- mesmo critério do teto de 500
 * comprovantes no download. Duas mil linhas são uns três anos de uma igreja de
 * porte comum.
 */
export const KARDEX_MAX_LINHAS = 2000;

export type LinhaDoKardex = {
  id: string;
  transactionDate: string;
  description: string;
  category: string;
  counterparty: string | null;
  paymentMethod: string | null;
  type: string;
  entrada: string | null;
  saida: string | null;
  saldo: string;
  retroactive: boolean;
  retroactiveReason: string | null;
  recordedOn: string;
};

export type Kardex = {
  periodo: { de: string; ate: string };
  saldoAnterior: string;
  linhas: LinhaDoKardex[];
  totais: {
    entradas: string;
    saidas: string;
    saldoFinal: string;
    lancamentos: number;
    retroativos: number;
    pendentesNoPeriodo: number;
    pendentesValor: string;
  };
};

/** O mês corrente na igreja, quando quem chama não escolheu período. */
export function periodoPadrao(fuso: string | null | undefined) {
  const hoje = hojeNoFuso(fuso);
  const [ano, mes] = hoje.split("-");
  const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate();
  return { de: `${ano}-${mes}-01`, ate: `${ano}-${mes}-${String(ultimoDia).padStart(2, "0")}` };
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' ou nada. Comparação de string exige forma garantida. */
export function validarPeriodo(de: string, ate: string): string | null {
  if (!DATA_ISO.test(de) || !DATA_ISO.test(ate)) return "As datas do período devem estar no formato AAAA-MM-DD.";
  if (de > ate) return "A data inicial do período não pode ser posterior à final.";
  return null;
}

export async function montarKardex(
  organizationId: string,
  periodo: { de: string; ate: string },
  fuso: string | null | undefined,
): Promise<Kardex | { erro: string }> {
  const tz = fuso || FUSO_PADRAO;

  // 1. SALDO ANTERIOR -- tudo o que se moveu antes do primeiro dia do período.
  //    Uma consulta própria, e não a primeira linha da outra: o período pode
  //    não ter lançamento nenhum e o saldo anterior continua existindo.
  const anterior = await query<{ saldo: string }>(
    `SELECT COALESCE(sum(${MOVIMENTO}), 0)::text AS saldo
       FROM financial_transactions
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND status = 'paid'
        AND transaction_date < $2`,
    [organizationId, periodo.de],
  );
  const saldoAnterior = anterior.rows[0].saldo;

  // 2. Conta antes de trazer. Recusar depois de montar 40 mil linhas seria
  //    pagar o custo inteiro para no fim dizer que não dá.
  const contagem = await query<{ pagos: number; pendentes: number; pendentesValor: string }>(
    `SELECT
       count(*) FILTER (WHERE status = 'paid')::int AS pagos,
       count(*) FILTER (WHERE status = 'pending')::int AS pendentes,
       COALESCE(sum(amount) FILTER (WHERE status = 'pending'), 0)::text AS "pendentesValor"
     FROM financial_transactions
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND transaction_date BETWEEN $2 AND $3`,
    [organizationId, periodo.de, periodo.ate],
  );
  const { pagos, pendentes, pendentesValor } = contagem.rows[0];
  if (pagos > KARDEX_MAX_LINHAS) {
    return {
      erro:
        `Este período tem ${pagos} lançamentos e o kardex imprime no máximo ${KARDEX_MAX_LINHAS}. ` +
        "Escolha um período menor -- um mês ou um trimestre -- e imprima em partes.",
    };
  }

  // 3. As linhas, com o saldo corrente.
  //
  //    A janela ordena pelo MESMO critério do ORDER BY de fora. Se os dois
  //    divergissem, o saldo de cada linha seria calculado numa ordem e impresso
  //    noutra -- as linhas certas, os saldos embaralhados, o total no pé
  //    correto. Ficam juntos e escritos igual de propósito.
  const { rows } = await query<LinhaDoKardex>(
    `SELECT
       id,
       transaction_date AS "transactionDate",
       description, category,
       counterparty,
       payment_method AS "paymentMethod",
       type,
       CASE WHEN type = 'income'  THEN amount::text END AS entrada,
       CASE WHEN type = 'expense' THEN amount::text END AS saida,
       ($4::numeric + sum(${MOVIMENTO}) OVER (
          ORDER BY transaction_date, created_at, id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ))::text AS saldo,
       retroactive,
       retroactive_reason AS "retroactiveReason",
       (created_at AT TIME ZONE $5)::date AS "recordedOn"
     FROM financial_transactions
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND status = 'paid'
        AND transaction_date BETWEEN $2 AND $3
      ORDER BY transaction_date, created_at, id`,
    [organizationId, periodo.de, periodo.ate, saldoAnterior, tz],
  );

  const somar = (filtro: (l: LinhaDoKardex) => string | null) =>
    rows.reduce((total, linha) => total + Number(filtro(linha) ?? 0), 0).toFixed(2);

  return {
    periodo,
    saldoAnterior,
    linhas: rows,
    totais: {
      entradas: somar(l => l.entrada),
      saidas: somar(l => l.saida),
      // O saldo final é o da ÚLTIMA LINHA, e não uma soma refeita: se os dois
      // caminhos discordassem, o pé da página contradiria a última linha da
      // tabela logo acima dele. Período sem movimento fica com o saldo anterior.
      saldoFinal: rows.length > 0 ? rows[rows.length - 1].saldo : saldoAnterior,
      lancamentos: rows.length,
      retroativos: rows.filter(l => l.retroactive).length,
      pendentesNoPeriodo: pendentes,
      pendentesValor,
    },
  };
}
