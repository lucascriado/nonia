import { Op, col, fn } from "sequelize";
import { hojeNoFuso, FUSO_PADRAO } from "@/lib/datas";
import { FinancialTransaction } from "@/lib/models";

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

/**
 * DINHEIRO EM CENTAVOS INTEIROS (BigInt), nunca float.
 *
 * `amount` é numeric(12,2) e chega do banco como texto ("150.00"). A conta do
 * saldo corrente é feita em centavos e volta a texto no formato em que o
 * Postgres escreve um numeric de duas casas -- "-30.00", "1234.50" --, que é o
 * que o kardex sempre devolveu.
 */
const CEM = BigInt(100);
const ZERO = BigInt(0);

function centavos(valor: string): bigint {
  const negativo = valor.trim().startsWith("-");
  const [inteiro, fracao = ""] = valor.trim().replace("-", "").split(".");
  const absoluto = BigInt(inteiro || "0") * CEM + BigInt((fracao + "00").slice(0, 2));
  return negativo ? -absoluto : absoluto;
}

function paraTexto(valor: bigint): string {
  const negativo = valor < ZERO;
  const absoluto = negativo ? -valor : valor;
  return `${negativo ? "-" : ""}${absoluto / CEM}.${String(absoluto % CEM).padStart(2, "0")}`;
}

/** Sinal do lançamento no saldo. Entrada soma, saída subtrai. */
const movimento = (type: string, amount: string) => (type === "income" ? centavos(amount) : -centavos(amount));

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
  //
  //    A soma por tipo sai do banco como TEXTO (numeric), e a subtração é em
  //    centavos inteiros: nenhum float entre o banco e o papel.
  const porTipo = await FinancialTransaction.findAll({
    attributes: ["type", [fn("sum", col("amount")), "soma"]],
    where: {
      organizationId,
      deletedAt: null,
      status: "paid",
      transactionDate: { [Op.lt]: periodo.de },
    },
    group: ["type"],
    raw: true,
  }) as unknown as { type: string; soma: string }[];
  // Sem lançamento nenhum, "0" -- o COALESCE(sum, 0) de antes, que não tinha casas.
  const saldoAnterior = porTipo.length === 0
    ? "0"
    : paraTexto(porTipo.reduce((saldo, { type, soma }) => saldo + movimento(type, soma), ZERO));

  // 2. Conta antes de trazer. Recusar depois de montar 40 mil linhas seria
  //    pagar o custo inteiro para no fim dizer que não dá.
  const porStatus = await FinancialTransaction.findAll({
    attributes: ["status", [fn("count", col("id")), "quantos"], [fn("sum", col("amount")), "soma"]],
    where: {
      organizationId,
      deletedAt: null,
      transactionDate: { [Op.between]: [periodo.de, periodo.ate] },
    },
    group: ["status"],
    raw: true,
  }) as unknown as { status: string; quantos: string | number; soma: string }[];
  const doStatus = (status: string) => porStatus.find((l) => l.status === status);
  const pagos = Number(doStatus("paid")?.quantos ?? 0);
  const pendentes = Number(doStatus("pending")?.quantos ?? 0);
  const pendentesValor = doStatus("pending")?.soma ?? "0";
  if (pagos > KARDEX_MAX_LINHAS) {
    return {
      erro:
        `Este período tem ${pagos} lançamentos e o kardex imprime no máximo ${KARDEX_MAX_LINHAS}. ` +
        "Escolha um período menor -- um mês ou um trimestre -- e imprima em partes.",
    };
  }

  // 3. As linhas, com o saldo corrente.
  //
  //    O saldo é acumulado AQUI, percorrendo as linhas NA ORDEM EM QUE O BANCO
  //    AS DEVOLVEU -- e essa ordem é o ORDER BY abaixo, com o desempate
  //    completo. Era uma window function no SQL, e a regra era a mesma: a
  //    janela ordenava pelo mesmo critério do ORDER BY de fora. Se as duas
  //    ordens divergissem, o saldo de cada linha seria calculado numa ordem e
  //    impresso noutra -- as linhas certas, os saldos embaralhados, o total no
  //    pé correto. Com uma ordem só, não há como divergirem. NÃO reordene
  //    `brutas` depois desta consulta.
  const brutas = await FinancialTransaction.findAll({
    attributes: [
      "id", "transactionDate", "description", "category", "counterparty",
      "paymentMethod", "type", "amount", "retroactive", "retroactiveReason", "created_at",
    ],
    where: {
      organizationId,
      deletedAt: null,
      status: "paid",
      transactionDate: { [Op.between]: [periodo.de, periodo.ate] },
    },
    order: [["transactionDate", "ASC"], ["created_at", "ASC"], ["id", "ASC"]],
    raw: true,
  }) as unknown as (FinancialTransaction & { created_at: Date })[];

  let corrente = centavos(saldoAnterior);
  const rows: LinhaDoKardex[] = brutas.map((l) => {
    corrente += movimento(l.type, l.amount);
    return {
      id: l.id,
      transactionDate: l.transactionDate,
      description: l.description,
      category: l.category,
      counterparty: l.counterparty,
      paymentMethod: l.paymentMethod,
      type: l.type,
      entrada: l.type === "income" ? l.amount : null,
      saida: l.type === "expense" ? l.amount : null,
      saldo: paraTexto(corrente),
      retroactive: l.retroactive,
      retroactiveReason: l.retroactiveReason,
      // O dia em que foi LANÇADO, no calendário da igreja.
      recordedOn: hojeNoFuso(tz, new Date(l.created_at)),
    };
  });

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
