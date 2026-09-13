import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { FinancialTransaction, FinancialTransactionPayment } from "@/lib/models";
import { apiError } from "@/lib/records";
import { assertAffected } from "@/lib/tenant";
import { financeAttributes, FinancePayload, parcelasDoPagamento, validateFinancePayload } from "@/lib/finance-records";
import { HttpError, notFound, readJson, requireUuid } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("finance.read");
    const { id } = await context.params;
    requireUuid(id, "Lançamento não encontrado.");

    // Com o comprovante, que a listagem não traz mais por peso.
    const lancamento = await FinancialTransaction.findOne({
      attributes: [
        "id", "type", "description", "category", "counterparty", "amount", "status",
        "transactionDate", "paymentMethod", "attachmentUrl", "attachmentName", "notes",
        "retroactive", "retroactiveReason",
      ],
      where: { id, organizationId: organizationId(auth), deletedAt: null },
      raw: true,
    });
    if (!lancamento) throw notFound("Lançamento não encontrado.");

    // AS FORMAS SAEM AQUI, na rota de UM lançamento, e não na listagem.
    // É a mesma divisão que o comprovante já faz: a lista diz o essencial
    // (a coluna payment_method, que com divisão diz "Dividido"), e o
    // detalhe vem quando alguém abre o lançamento. Sem isto o formulário
    // de edição não teria como mostrar a divisão que vai editar.
    //
    // Array vazio quando não houve divisão -- e vazio aqui é resposta, não
    // ausência: significa forma única, que está em paymentMethod.
    //
    // O valor é TEXTO ("60.00"), como o `amount` do lançamento: DECIMAL chega
    // do banco como string e não passa por float.
    const payments = await FinancialTransactionPayment.findAll({
      attributes: [["payment_method", "method"], "amount"],
      where: { transactionId: id, organizationId: organizationId(auth) },
      order: [["amount", "DESC"], ["paymentMethod", "ASC"]],
      raw: true,
    });

    return Response.json({ ...lancamento, payments });
  } catch (error) {
    return apiError(error);
  }
}


export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("finance.write");
    const { id } = await context.params;
    requireUuid(id, "Lançamento não encontrado.");
    const payload = await readJson<FinancePayload>(request);
    // Mesmo fuso da criação. Vale para a edição também, e é de propósito:
    // trocar a data de um lançamento para uma data passada é exatamente o ato
    // que a marca de retroativo existe para registrar -- deixar a edição de
    // fora seria um caminho por onde a data velha entra sem marca nenhuma.
    const validationError = validateFinancePayload(payload, auth.organization.timezone);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const attributes = financeAttributes(payload);

    /**
     * EDITAR UM LANÇAMENTO DIVIDIDO.
     *
     * A chave `payments` AUSENTE não é o mesmo que `payments` vazio — é a
     * mesma rede de segurança que `attachmentUrl` já tem neste módulo: a chave
     * ausente preserva o que está gravado, e só o vazio explícito apaga.
     *
     * Aqui ela não pode nem preservar nem apagar em silêncio, e o motivo é
     * concreto: mudar o TOTAL de um lançamento dividido sem mexer nas partes
     * quebra a soma, e a trigger diferida do banco reprovaria no COMMIT — a
     * pessoa levaria um 500 depois de salvar. As três saídas possíveis eram
     * deixar estourar (500 cru), apagar as partes calado (perda de dado
     * silenciosa) ou recusar com uma frase. É a terceira.
     *
     * Quem manda `payments` — com duas ou mais formas, ou vazio para voltar a
     * forma única — edita normalmente.
     */
    const parcelas = parcelasDoPagamento(payload);
    const mandouFormas = payload.payments !== undefined;

    await db.transaction(async (transaction) => {
      const existentes = await FinancialTransactionPayment.count({
        where: { transactionId: id, organizationId: organizationId(auth) },
        transaction,
      });
      if (existentes > 0 && !mandouFormas) {
        throw new HttpError(
          400,
          "Este lançamento foi dividido em mais de uma forma de pagamento. Edite-o com as formas, "
            + "ou escolha uma forma única para deixar de ser dividido.",
          "lancamento_dividido",
        );
      }

      // Lançamento na lixeira não se edita: restaure primeiro.
      const [affected] = await FinancialTransaction.update(attributes, {
        where: { id, organizationId: organizationId(auth), deletedAt: null },
        transaction,
      });
      assertAffected(affected, "Lançamento não encontrado.");

      if (mandouFormas) {
        // Reescreve inteiro em vez de casar linha a linha: o conjunto de
        // formas é pequeno e a diferença nunca vale o risco de sobrar uma
        // parte órfã. A trigger é diferida, então o estado sem partes no meio
        // da transação não reprova nada.
        await FinancialTransactionPayment.destroy({
          where: { transactionId: id, organizationId: organizationId(auth) },
          transaction,
        });
        for (const parcela of parcelas ?? []) {
          await FinancialTransactionPayment.create({
            organizationId: organizationId(auth),
            transactionId: id,
            paymentMethod: parcela.method,
            amount: parcela.amount,
          }, { transaction });
        }
      }

      await addActivity(transaction, auth, "financial", "atualizou o lançamento", attributes.description);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("finance.write");
    const { id } = await context.params;
    requireUuid(id, "Lançamento não encontrado.");

    await db.transaction(async (transaction) => {
      const record = await FinancialTransaction.findOne({
        where: { id, organizationId: organizationId(auth), deletedAt: null },
        transaction,
      });
      if (!record) assertAffected(0, "Lançamento não encontrado.");

      // Marca, não remove. Dado contábil não some sem volta.
      await FinancialTransaction.update(
        { deletedAt: new Date(), deletedBy: auth.user.id },
        { where: { id, organizationId: organizationId(auth), deletedAt: null }, transaction },
      );
      await addActivity(transaction, auth, "financial", "excluiu o lançamento", record?.description);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
