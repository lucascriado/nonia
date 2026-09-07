import { organizationId, requirePermission } from "@/lib/auth";
import { apiError } from "@/lib/records";
import { montarKardex, periodoPadrao, validarPeriodo, KARDEX_MAX_LINHAS } from "@/lib/finance-kardex";

export const runtime = "nodejs";

/**
 * O KARDEX -- extrato em ordem, com saldo corrente linha a linha, para imprimir.
 *
 *   GET /api/financeiro/kardex?de=2026-09-01&ate=2026-09-30
 *
 * Sem `de`/`ate`, o mês corrente NO FUSO DA IGREJA. Isso importa: em UTC, o dia
 * 1º de setembro às 21h em Brasília já é 2 de setembro, e um kardex que decide
 * sozinho o período tem que decidir no calendário de quem imprime.
 *
 * RESPOSTA
 *   { periodo: { de, ate },
 *     saldoAnterior: "1234.56",
 *     linhas: [ { transactionDate, description, category, counterparty,
 *                 paymentMethod, type, entrada, saida, saldo,
 *                 retroactive, retroactiveReason, recordedOn } ],
 *     totais: { entradas, saidas, saldoFinal, lancamentos, retroativos,
 *               pendentesNoPeriodo, pendentesValor } }
 *
 * VALORES SÃO STRING, e não number. `amount` é numeric(12,2), e passar por
 * double para virar JSON é como centavo some. Quem imprime formata a string.
 *
 * `entrada` e `saida` são exclusivos -- uma é null na outra --, que é a forma de
 * duas colunas de um kardex de papel. `saldo` já vem acumulado com o
 * `saldoAnterior` embutido, então a tela imprime a coluna sem somar nada.
 *
 * SÓ MOVIMENTO REALIZADO ENTRA nas linhas (`status = 'paid'`, não excluído).
 * Pendente é conta a pagar, não dinheiro que se moveu. Ele não some da vista:
 * volta em `pendentesNoPeriodo` e `pendentesValor`, para o rodapé impresso
 * poder dizer que existem -- o que o kardex não pode é misturá-los no saldo.
 *
 * PERÍODO GRANDE DEMAIS É RECUSADO, não truncado, com 400 e uma frase que diz o
 * que fazer. Kardex com linhas faltando tem saldo coerente entre as linhas que
 * sobraram: pareceria certo e estaria errado.
 *
 * `finance.read` e não uma permissão nova: é o mesmo dado da tela do
 * financeiro, na mesma igreja, em outra ordem. Permissão nova prometeria um
 * controle de acesso que não existe.
 */
export async function GET(request: Request) {
  try {
    const auth = await requirePermission("finance.read");
    const { searchParams } = new URL(request.url);
    const fuso = auth.organization.timezone;

    const padrao = periodoPadrao(fuso);
    const de = searchParams.get("de")?.trim() || padrao.de;
    const ate = searchParams.get("ate")?.trim() || padrao.ate;

    const erroDePeriodo = validarPeriodo(de, ate);
    if (erroDePeriodo) return Response.json({ error: erroDePeriodo }, { status: 400 });

    const kardex = await montarKardex(organizationId(auth), { de, ate }, fuso);
    if ("erro" in kardex) {
      return Response.json({ error: kardex.erro, maxLinhas: KARDEX_MAX_LINHAS }, { status: 400 });
    }
    return Response.json(kardex);
  } catch (error) {
    return apiError(error);
  }
}
