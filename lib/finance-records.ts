import { dataEhAnteriorAHoje } from "@/lib/datas";

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
  retroactive?: boolean;
  retroactiveReason?: string;
};

const nullable = (value?: string) => value?.trim() || null;

/**
 * Atributos do lançamento a partir do formulário.
 *
 * Mesma rede de segurança da foto em `personAttributes`: a chave
 * attachmentUrl ausente preserva o comprovante existente, porque a listagem
 * deixou de devolvê-lo (podia ter 2 MB por lançamento). Só null ou vazio
 * explícitos apagam.
 */
export function financeAttributes(payload: FinancePayload) {
  const anexo = payload.attachmentUrl === undefined ? {} : { attachmentUrl: nullable(payload.attachmentUrl) };
  return {
    ...anexo,
    type: payload.type === "expense" ? "expense" : "income",
    description: payload.description!.trim(),
    category: payload.category!.trim(),
    counterparty: nullable(payload.counterparty),
    amount: payload.amount!.trim(),
    status: payload.status === "pending" ? "pending" : "paid",
    transactionDate: payload.transactionDate!.trim(),
    paymentMethod: nullable(payload.paymentMethod),
    attachmentName: nullable(payload.attachmentName),
    notes: nullable(payload.notes),
    // A marca vem do formulário e SÓ do formulário. Em nenhum ponto deste
    // arquivo ela é derivada de `transactionDate` -- ver o cabeçalho da
    // migration 019 e `validateFinancePayload` logo abaixo.
    retroactive: payload.retroactive === true,
    // Justificativa sem marca não é estado possível (há CHECK no banco), então
    // ela é descartada aqui em vez de chegar lá e virar 500.
    retroactiveReason: payload.retroactive === true ? nullable(payload.retroactiveReason) : null,
  };
}

/**
 * REGRA DO LANÇAMENTO RETROATIVO, e por que ela mora aqui e não no banco.
 *
 * "Data anterior a hoje exige a marca" depende de "hoje", e "hoje" depende do
 * fuso da igreja. Um CHECK no banco teria que comparar com CURRENT_DATE: não
 * seria imutável, seguiria o fuso da SESSÃO do Postgres (que é UTC), e -- pior
 * -- passaria a reprovar qualquer UPDATE futuro numa linha antiga que está
 * gravada e correta. Corrigir o telefone de um lançamento de março não pode
 * falhar porque março já passou.
 *
 * Aqui, além de estar certo, dá para EXPLICAR: quem digitou recebe uma frase
 * dizendo o que fazer, e não um erro de constraint.
 *
 * DATA FUTURA CONTINUA PERMITIDA, e sem marca nenhuma. Conta a vencer é caso
 * legítimo -- é para isso que existe `status = 'pending'`. Retroativo é sobre
 * o passado; o futuro não é a mesma coisa ao contrário.
 */
export function validateFinancePayload(payload: FinancePayload, fusoDaIgreja?: string | null) {
  const type = payload.type === "expense" ? "expense" : "income";
  const allowedCategories: readonly string[] = type === "income" ? incomeCategories : expenseCategories;

  if (!payload.description?.trim()) return "Descrição é obrigatória.";
  if (!payload.category?.trim() || !allowedCategories.includes(payload.category.trim())) return "Selecione uma categoria válida para o tipo escolhido.";
  if (!payload.transactionDate?.trim()) return "Data é obrigatória.";

  if (payload.transactionDate?.trim() && !payload.retroactive
      && dataEhAnteriorAHoje(payload.transactionDate.trim(), fusoDaIgreja)) {
    return "Esta data já passou. Marque o lançamento como retroativo para registrá-lo com data anterior a hoje.";
  }
  if (payload.retroactiveReason?.trim() && !payload.retroactive) {
    return "A justificativa só existe em lançamento marcado como retroativo.";
  }
  if (payload.retroactiveReason && payload.retroactiveReason.trim().length > 200) {
    return "A justificativa do retroativo deve ter no máximo 200 caracteres.";
  }

  const amount = Number(payload.amount);
  if (!payload.amount?.trim() || !Number.isFinite(amount) || amount <= 0) return "Informe um valor válido maior que zero.";

  if (payload.attachmentUrl?.trim()) {
    if (!attachmentDataUrlPattern.test(payload.attachmentUrl)) return "O comprovante deve ser PNG, JPG ou PDF.";
    if (Buffer.byteLength(payload.attachmentUrl, "utf8") > ATTACHMENT_MAX_BYTES * 1.4) return "O comprovante deve ter no máximo 2 MB.";
  }

  return null;
}
