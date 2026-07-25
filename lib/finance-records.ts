export const incomeCategories = ["Dízimos", "Ofertas", "Doações", "Eventos", "Outras Receitas"] as const;
export const expenseCategories = ["Aluguel", "Contas e Utilidades", "Manutenção", "Missões", "Salários", "Materiais", "Eventos", "Outras Despesas"] as const;
export const paymentMethods = ["Pix", "Dinheiro", "Cartão", "Transferência", "Boleto", "Outro"] as const;

export const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
const attachmentDataUrlPattern = /^data:(image\/(png|jpeg)|application\/pdf);base64,[A-Za-z0-9+/=]+$/;

export type FinancePayload = {
  type?: string;
  description?: string;
  category?: string;
  counterparty?: string;
  amount?: string;
  status?: string;
  transactionDate?: string;
  paymentMethod?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  notes?: string;
};

const nullable = (value?: string) => value?.trim() || null;

export function financeAttributes(payload: FinancePayload) {
  return {
    type: payload.type === "expense" ? "expense" : "income",
    description: payload.description!.trim(),
    category: payload.category!.trim(),
    counterparty: nullable(payload.counterparty),
    amount: payload.amount!.trim(),
    status: payload.status === "pending" ? "pending" : "paid",
    transactionDate: payload.transactionDate!.trim(),
    paymentMethod: nullable(payload.paymentMethod),
    attachmentUrl: nullable(payload.attachmentUrl),
    attachmentName: nullable(payload.attachmentName),
    notes: nullable(payload.notes),
  };
}

export function validateFinancePayload(payload: FinancePayload) {
  const type = payload.type === "expense" ? "expense" : "income";
  const allowedCategories: readonly string[] = type === "income" ? incomeCategories : expenseCategories;

  if (!payload.description?.trim()) return "Descrição é obrigatória.";
  if (!payload.category?.trim() || !allowedCategories.includes(payload.category.trim())) return "Selecione uma categoria válida para o tipo escolhido.";
  if (!payload.transactionDate?.trim()) return "Data é obrigatória.";

  const amount = Number(payload.amount);
  if (!payload.amount?.trim() || !Number.isFinite(amount) || amount <= 0) return "Informe um valor válido maior que zero.";

  if (payload.attachmentUrl?.trim()) {
    if (!attachmentDataUrlPattern.test(payload.attachmentUrl)) return "O comprovante deve ser PNG, JPG ou PDF.";
    if (Buffer.byteLength(payload.attachmentUrl, "utf8") > ATTACHMENT_MAX_BYTES * 1.4) return "O comprovante deve ter no máximo 2 MB.";
  }

  return null;
}
