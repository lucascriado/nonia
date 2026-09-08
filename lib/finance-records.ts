import { dataEhAnteriorAHoje } from "@/lib/datas";

export const incomeCategories = ["Dízimos", "Ofertas", "Doações", "Eventos", "Outras Receitas"] as const;
export const expenseCategories = ["Aluguel", "Contas e Utilidades", "Manutenção", "Missões", "Salários", "Materiais", "Eventos", "Outras Despesas"] as const;
export const paymentMethods = ["Pix", "Dinheiro", "Cartão", "Transferência", "Boleto", "Outro"] as const;

/**
 * O que `payment_method` guarda quando o lançamento foi dividido em mais de
 * uma forma.
 *
 * NÃO é uma forma de pagamento -- é o aviso de que houve mais de uma, para
 * quem lê a coluna SOZINHA. A listagem do financeiro, o kardex e o CSV leem
 * essa coluna e não sabem que existe tabela de partes; sem este valor, um
 * lançamento dividido apareceria com a forma em branco (mentira por omissão)
 * ou com uma das formas (meia verdade). Ver a migration 021, e o banco garante
 * a coerência nos dois sentidos por trigger.
 *
 * Por ser reservado, ele NÃO pode ser escolhido como forma única -- senão
 * "Dividido" passaria a significar duas coisas.
 */
export const FORMA_DIVIDIDA = "Dividido";

/** Uma parte da divisão: uma forma e quanto veio por ela. */
export type ParcelaDePagamento = { method?: string; amount?: string };

/**
 * Dinheiro em CENTAVOS, como inteiro.
 *
 * Somar "0.01" + "0.02" em ponto flutuante dá 0.030000000000000002, e a
 * comparação com o total falharia num lançamento perfeitamente correto. O
 * banco compara `numeric` e é exato; aqui a conta precisa ser em inteiro para
 * dizer a MESMA coisa que ele -- duas respostas diferentes para a mesma
 * pergunta seria pior que não validar.
 */
export const centavos = (valor: string) => Math.round(Number(valor) * 100);

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
  /**
   * As formas de pagamento, quando foi mais de uma. Ausente ou com uma só, o
   * lançamento segue no caminho de sempre: a forma única em `paymentMethod`.
   */
  payments?: ParcelaDePagamento[];
};

/**
 * As partes já normalizadas, ou null quando não há divisão.
 *
 * Uma parte só NÃO vira divisão: vira forma única. Duas representações do
 * mesmo estado divergiriam, e o banco recusa a de uma parte só de propósito.
 */
export function parcelasDoPagamento(payload: FinancePayload) {
  const lista = (payload.payments ?? [])
    .map(p => ({ method: p.method?.trim() ?? "", amount: p.amount?.trim() ?? "" }))
    .filter(p => p.method || p.amount);
  if (lista.length < 2) return null;
  return lista;
}

/** A forma que vai para a coluna antiga, sem nunca deixá-la mentir. */
export function formaDoLancamento(payload: FinancePayload) {
  const parcelas = parcelasDoPagamento(payload);
  if (parcelas) return FORMA_DIVIDIDA;
  const unica = payload.payments?.length === 1
    ? payload.payments[0].method?.trim() || null
    : null;
  return unica ?? (payload.paymentMethod?.trim() || null);
}

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
    // Nunca `payload.paymentMethod` cru: com divisão, a coluna tem que dizer
    // "Dividido", e é isso que impede a listagem, o kardex e o CSV -- que não
    // serão tocados -- de mentirem sobre este lançamento.
    paymentMethod: formaDoLancamento(payload),
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

  const erroDasFormas = validarFormasDePagamento(payload, amount);
  if (erroDasFormas) return erroDasFormas;

  if (payload.attachmentUrl?.trim()) {
    if (!attachmentDataUrlPattern.test(payload.attachmentUrl)) return "O comprovante deve ser PNG, JPG ou PDF.";
    if (Buffer.byteLength(payload.attachmentUrl, "utf8") > ATTACHMENT_MAX_BYTES * 1.4) return "O comprovante deve ter no máximo 2 MB.";
  }

  return null;
}

/**
 * As formas de pagamento de um lançamento dividido.
 *
 * O BANCO JÁ GARANTE ISTO — a trigger diferida da 021 recusa soma que não
 * fecha, parte única e a coluna antiga mentindo. Validar aqui não é
 * desconfiança do banco: é a diferença entre a pessoa ler "as formas somam
 * 450,00 e o total é 500,00" e receber um 500 com erro de constraint. A
 * garantia é do banco; a FRASE é daqui.
 */
export function validarFormasDePagamento(payload: FinancePayload, total: number) {
  const unica = payload.payments?.length === 1 ? payload.payments[0].method?.trim() : undefined;
  const formaSolta = payload.paymentMethod?.trim();

  // "Dividido" é marca reservada, não forma. Aceitá-la como forma única faria
  // a coluna dizer "houve divisão" num lançamento sem divisão nenhuma — a
  // mentira que a coluna existe para não contar.
  for (const candidata of [unica, formaSolta]) {
    if (candidata === FORMA_DIVIDIDA) {
      return `"${FORMA_DIVIDIDA}" não é uma forma de pagamento: é a marca de que o lançamento foi dividido. Escolha as formas.`;
    }
  }

  const parcelas = parcelasDoPagamento(payload);
  if (!parcelas) return null;

  const formasValidas: readonly string[] = paymentMethods;
  const vistas = new Set<string>();
  let soma = 0;
  for (const parcela of parcelas) {
    if (!parcela.method || !formasValidas.includes(parcela.method)) {
      return "Escolha uma forma de pagamento válida em cada parte do lançamento.";
    }
    // O banco tem UNIQUE (transaction_id, payment_method): "Pix 200 e Pix 300"
    // é "Pix 500", e repetir é engano de digitação, não intenção.
    if (vistas.has(parcela.method)) {
      return `A forma "${parcela.method}" aparece duas vezes. Some os valores dela numa linha só.`;
    }
    vistas.add(parcela.method);

    const valor = Number(parcela.amount);
    if (!parcela.amount || !Number.isFinite(valor) || valor <= 0) {
      return `Informe um valor maior que zero para "${parcela.method}".`;
    }
    soma += centavos(parcela.amount);
  }

  // Em centavos inteiros, e não em reais: ver `centavos`.
  if (soma !== centavos(String(total))) {
    const emReais = (c: number) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    const diferenca = soma - centavos(String(total));
    return `As formas de pagamento somam R$ ${emReais(soma)} e o total do lançamento é R$ ${emReais(centavos(String(total)))}. `
      + (diferenca > 0 ? `Sobram R$ ${emReais(diferenca)}.` : `Faltam R$ ${emReais(-diferenca)}.`);
  }
  return null;
}
