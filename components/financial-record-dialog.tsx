"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, CalendarDays, CreditCard, LoaderCircle, Paperclip, Plus, Save, Split, Tag, X } from "lucide-react";
import { expenseCategories, incomeCategories, paymentMethods, ATTACHMENT_MAX_BYTES } from "@/lib/finance-records";
import { useSession } from "@/components/current-user";
import { hojeNoFuso } from "@/lib/datas";

export type FinancialRecordValues = {
  type: string;
  description: string;
  category: string;
  counterparty: string;
  amount: string;
  status: string;
  transactionDate: string;
  paymentMethod: string;
  attachmentUrl: string;
  attachmentName: string;
  notes: string;
  /**
   * Divisão do pagamento em várias formas. Contrato do backend:
   * ausente ou com UMA forma = caminho normal (paymentMethod); DUAS ou mais =
   * dividido; `[]` explícito desfaz uma divisão anterior. "Dividido" é MARCA que
   * a API põe sozinha na coluna antiga -- a tela nunca a manda nem a oferece.
   */
  payments?: { method: string; amount: string }[];
};

/**
 * A data NÃO está aqui, e a ausência é o conserto.
 *
 * Ela era `new Date().toISOString().slice(0, 10)` neste objeto, e isso errava
 * de dois jeitos ao mesmo tempo:
 *
 *  1. FUSO -- `toISOString()` é UTC. Em Brasília, das 21h à meia-noite, ele
 *     devolve AMANHÃ, e a tesouraria lança o culto da noite com a data do dia
 *     seguinte. No dia 30 ou 31 o lançamento pula de MÊS e desloca o
 *     fechamento.
 *  2. MOMENTO -- sendo constante de módulo, a data congelava na hora em que a
 *     aba carregou. Uma aba aberta desde ontem abria o formulário com ontem.
 *
 * Agora ela é calculada na hora em que o formulário abre, no fuso da igreja.
 */
const emptyValues: FinancialRecordValues = {
  type: "income",
  description: "",
  category: incomeCategories[0],
  counterparty: "",
  amount: "",
  status: "paid",
  transactionDate: "",
  paymentMethod: "",
  attachmentUrl: "",
  attachmentName: "",
  notes: "",
};

/** Reais em texto -> centavos inteiros, para a soma da divisão bater com o total
 *  sem erro de ponto flutuante (é como a API compara). */
function emCentavos(valor: string) {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function reais(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function normalizeValues(hoje: string, initialValues?: Partial<FinancialRecordValues>) {
  const normalized = { ...emptyValues, transactionDate: hoje };
  // `payments` fica de fora: é array, tratado à parte no formulário. Aqui só as
  // strings planas, como sempre.
  for (const key of Object.keys(emptyValues) as Array<Exclude<keyof FinancialRecordValues, "payments">>) {
    const value = initialValues?.[key];
    if (typeof value === "string") normalized[key] = value;
  }
  return normalized;
}

export function FinancialRecordDialog({
  open,
  mode,
  initialValues,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initialValues?: Partial<FinancialRecordValues>;
  onClose: () => void;
  mode: "create" | "edit" | "view";
  onSubmit: (values: FinancialRecordValues) => Promise<boolean>;
}) {
  // O fuso da igreja, não o do navegador: uma secretária viajando não muda o
  // dia em que a igreja lança. Enquanto a sessão não respondeu, `organization`
  // é null e o fallback de `hojeNoFuso` vale -- e o formulário só abre depois.
  const { organization } = useSession();
  const fuso = organization?.timezone;
  const [values, setValues] = useState<FinancialRecordValues>(() => normalizeValues(hojeNoFuso(fuso), initialValues));
  const [submitting, setSubmitting] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  /** Ligado quando o pagamento é dividido em mais de uma forma. */
  const [dividir, setDividir] = useState(false);
  /** As partes da divisão. Só valem quando `dividir`; UMA parte não é divisão. */
  const [parcelas, setParcelas] = useState<{ method: string; amount: string }[]>([]);
  /** O lançamento JÁ era dividido ao abrir? Se era e vira forma única, mandamos
   *  `payments: []` para DESFAZER a divisão -- ausente não desfaz nada. */
  const eraDividido = (initialValues?.payments?.length ?? 0) >= 2;

  useEffect(() => {
    if (open) {
      // hojeNoFuso() roda AQUI, na abertura, e não uma vez por carregamento
      // da página: é o que faz a aba esquecida aberta desde ontem não sugerir
      // ontem.
      setValues(normalizeValues(hojeNoFuso(fuso), initialValues));
      setSubmitting(false);
      setAttachmentError("");
      // Abre dividido se a ficha veio com duas formas ou mais; uma só é forma única.
      const partes = initialValues?.payments ?? [];
      setDividir(partes.length >= 2);
      setParcelas(partes.length >= 2 ? partes.map((p) => ({ method: p.method, amount: p.amount })) : []);
    }
  }, [fuso, initialValues, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [onClose, open]);

  if (!open) return null;

  const readOnly = mode === "view";
  const isIncome = values.type === "income";
  const categories = isIncome ? incomeCategories : expenseCategories;

  // A soma das partes, em centavos, e se ela fecha com o total. É indicação AO
  // VIVO para a pessoa; a garantia dura é do banco e a frase exata é da API.
  const totalCentavos = emCentavos(values.amount);
  const somaParcelas = parcelas.reduce((acc, parte) => acc + emCentavos(parte.amount), 0);
  const partesPreenchidas = parcelas.filter((parte) => parte.method && parte.amount).length;
  const somaFecha = dividir && partesPreenchidas >= 2 && totalCentavos > 0 && somaParcelas === totalCentavos;

  function update(field: keyof FinancialRecordValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function ativarDivisao() {
    setDividir(true);
    // Começa com a forma já escolhida (se houver) e uma linha em branco, para
    // não partir do zero.
    setParcelas((atuais) => atuais.length ? atuais : [
      { method: values.paymentMethod || "", amount: "" },
      { method: "", amount: "" },
    ]);
  }
  function desativarDivisao() {
    setDividir(false);
  }
  function atualizarParcela(indice: number, campo: "method" | "amount", valor: string) {
    setParcelas((atuais) => atuais.map((parte, i) => (i === indice ? { ...parte, [campo]: valor } : parte)));
  }
  function adicionarParcela() {
    // No máximo uma linha por forma: o banco tem UNIQUE (lançamento, forma).
    setParcelas((atuais) => (atuais.length >= paymentMethods.length ? atuais : [...atuais, { method: "", amount: "" }]));
  }
  function removerParcela(indice: number) {
    setParcelas((atuais) => atuais.filter((_, i) => i !== indice));
  }

  function updateType(type: string) {
    const categories = type === "income" ? incomeCategories : expenseCategories;
    setValues((current) => ({ ...current, type, category: categories[0] }));
  }

  function updateAttachment(file: File | undefined) {
    setAttachmentError("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type)) {
      setAttachmentError("Use um arquivo PNG, JPG ou PDF.");
      return;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setAttachmentError("Use um arquivo de até 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.startsWith("data:image/png;base64,") && !result.startsWith("data:image/jpeg;base64,") && !result.startsWith("data:application/pdf;base64,")) {
        setAttachmentError("Não foi possível ler este arquivo.");
        return;
      }
      update("attachmentUrl", result);
      update("attachmentName", file.name);
    };
    reader.onerror = () => setAttachmentError("Não foi possível ler este arquivo.");
    reader.readAsDataURL(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting || readOnly) return;
    setSubmitting(true);
    try {
      const partesValidas = parcelas.filter((parte) => parte.method && parte.amount);
      const payload: FinancialRecordValues = { ...values };
      if (dividir && partesValidas.length >= 2) {
        // Divisão de verdade: mando as partes. A forma solta sai -- a API marca
        // "Dividido" sozinha na coluna antiga, e a tela nunca manda essa marca.
        payload.payments = partesValidas.map((parte) => ({ method: parte.method, amount: parte.amount }));
        payload.paymentMethod = "";
      } else {
        // Forma única. UMA parte não é divisão: ela vira a forma solta.
        if (dividir && partesValidas.length === 1) payload.paymentMethod = partesValidas[0].method;
        // `payments: []` só quando havia divisão a DESFAZER; ausente não desfaz.
        if (eraDividido) payload.payments = [];
      }
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="record-dialog-layer" role="dialog" aria-modal="true" aria-label={`${mode === "create" ? "Novo lançamento" : mode === "view" ? "Visualizar lançamento" : "Editar lançamento"} financeiro`}>
      <div className="record-dialog-top">
        <div>
          <strong>{mode === "create" ? "Novo Lançamento" : mode === "view" ? "Visualizar Lançamento" : "Editar Lançamento"}</strong>
          <span>{mode === "create" ? "Registre uma entrada ou saída financeira" : mode === "view" ? `Consulte os dados de ${values.description}` : `Atualize os dados de ${values.description}`}</span>
        </div>
        <button type="button" disabled={submitting} onClick={onClose} aria-label="Fechar formulário"><X /></button>
      </div>

      <form className="record-form finance-form" onSubmit={submit}>
        <fieldset className="record-form-fields" disabled={submitting || readOnly}>
          <section className="record-form-section finance-type-section">
            <h3>{isIncome ? <ArrowUpCircle /> : <ArrowDownCircle />}Tipo de lançamento</h3>
            <div className="finance-type-toggle" role="radiogroup" aria-label="Tipo de lançamento">
              <button type="button" className={isIncome ? "active income" : undefined} aria-pressed={isIncome} onClick={() => updateType("income")}><ArrowUpCircle />Entrada</button>
              <button type="button" className={!isIncome ? "active expense" : undefined} aria-pressed={!isIncome} onClick={() => updateType("expense")}><ArrowDownCircle />Saída</button>
            </div>
          </section>

          <FormSection title="Detalhes do Lançamento" icon={<Tag />} className="finance-details">
            <Field label="Descrição" wide required><input required value={values.description} onChange={(event) => update("description", event.target.value)} placeholder="Ex: Dízimo do mês, Conta de energia..." /></Field>
            <Field label="Categoria" required><select required value={values.category} onChange={(event) => update("category", event.target.value)}>{categories.map((option) => <option key={option}>{option}</option>)}</select></Field>
            <Field label="Valor (R$)" required><input required type="number" min="0.01" step="0.01" inputMode="decimal" value={values.amount} onChange={(event) => update("amount", event.target.value)} placeholder="0,00" /></Field>
            <Field label={isIncome ? "De onde veio" : "Para onde foi"}><input value={values.counterparty} onChange={(event) => update("counterparty", event.target.value)} placeholder={isIncome ? "Ex: Membro, evento, doador..." : "Ex: Fornecedor, concessionária..."} /></Field>
            <Field label="Forma de Pagamento" wide>
              {!dividir ? (
                <div className="finance-pay-single">
                  <select value={values.paymentMethod} onChange={(event) => update("paymentMethod", event.target.value)}>
                    <option value="">Selecione</option>
                    {paymentMethods.map((method) => <option key={method}>{method}</option>)}
                  </select>
                  {!readOnly && (
                    <button type="button" className="finance-pay-split-toggle" onClick={ativarDivisao}>
                      <Split aria-hidden />Dividir em mais de uma forma
                    </button>
                  )}
                </div>
              ) : (
                <div className="finance-pay-split">
                  <ul className="finance-pay-parts">
                    {parcelas.map((parte, indice) => {
                      // Cada forma só aparece uma vez: o banco tem UNIQUE por forma.
                      const usadasEmOutras = parcelas.filter((_, j) => j !== indice).map((p) => p.method);
                      return (
                        <li key={indice}>
                          <select value={parte.method} onChange={(event) => atualizarParcela(indice, "method", event.target.value)}>
                            <option value="">Forma</option>
                            {paymentMethods.map((method) => <option key={method} value={method} disabled={usadasEmOutras.includes(method)}>{method}</option>)}
                          </select>
                          <input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0,00" value={parte.amount} onChange={(event) => atualizarParcela(indice, "amount", event.target.value)} />
                          <button type="button" className="finance-pay-remove" aria-label="Remover forma" onClick={() => removerParcela(indice)}><X aria-hidden /></button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="finance-pay-split-foot">
                    <button type="button" onClick={adicionarParcela} disabled={parcelas.length >= paymentMethods.length}><Plus aria-hidden />Adicionar forma</button>
                    <button type="button" onClick={desativarDivisao}>Voltar para forma única</button>
                  </div>
                  {/* Indicação ao vivo. A frase exata que RECUSA é da API; esta só
                      ajuda antes de enviar. */}
                  <p className={`finance-pay-sum ${somaFecha ? "is-ok" : "is-off"}`} role="status">
                    {totalCentavos <= 0
                      ? "Informe o Valor (R$) total do lançamento acima."
                      : somaFecha
                        ? `As formas somam R$ ${reais(somaParcelas)}, igual ao total.`
                        : `As formas somam R$ ${reais(somaParcelas)} de R$ ${reais(totalCentavos)}. ${somaParcelas > totalCentavos ? `Sobram R$ ${reais(somaParcelas - totalCentavos)}.` : `Faltam R$ ${reais(totalCentavos - somaParcelas)}.`}`}
                  </p>
                </div>
              )}
            </Field>
          </FormSection>

          <FormSection title="Data e Situação" icon={<CalendarDays />} className="finance-status">
            <Field label="Data" required><input required type="date" value={values.transactionDate} onChange={(event) => update("transactionDate", event.target.value)} /></Field>
            <Field label="Status" required>
              <select required value={values.status} onChange={(event) => update("status", event.target.value)}><option value="paid">Pago</option><option value="pending">Pendente</option></select>
            </Field>
          </FormSection>

          <section className="record-form-section finance-attachment">
            <h3><Paperclip />Comprovante</h3>
            <div className="finance-attachment-body">
              {values.attachmentUrl ? (
                <span className="finance-attachment-file">
                  <Paperclip />
                  <a href={values.attachmentUrl} target="_blank" rel="noreferrer">{values.attachmentName || "Ver comprovante"}</a>
                </span>
              ) : (
                <small className="finance-attachment-empty">Nenhum comprovante anexado.</small>
              )}
              <label className="record-photo-button finance-attachment-button">
                {values.attachmentUrl ? "Trocar arquivo" : "Anexar comprovante"}
                <input type="file" accept="image/png,image/jpeg,application/pdf" onChange={(event) => { updateAttachment(event.target.files?.[0]); event.target.value = ""; }} />
              </label>
              {values.attachmentUrl && <button type="button" className="record-photo-remove" disabled={submitting} onClick={() => { update("attachmentUrl", ""); update("attachmentName", ""); }}>Remover comprovante</button>}
            </div>
            <small className="finance-attachment-hint">PNG, JPG ou PDF até 2 MB</small>
            {attachmentError && <small className="record-field-error">{attachmentError}</small>}
          </section>

          <FormSection title="Observações" icon={<CreditCard />} className="finance-notes">
            <Field label="Observações" wide><textarea value={values.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Algum detalhe relevante sobre este lançamento..." /></Field>
          </FormSection>
        </fieldset>

        {!readOnly && (
          <footer className="record-form-actions">
            <button type="button" className="record-cancel" disabled={submitting} onClick={onClose}>Cancelar</button>
            <button type="submit" className="record-save" disabled={submitting} aria-busy={submitting}>
              {submitting ? <LoaderCircle className="button-spinner" /> : <Save />}
              {submitting ? (mode === "create" ? "Salvando..." : "Alterando...") : mode === "create" ? "Salvar Lançamento" : "Alterar"}
            </button>
          </footer>
        )}
      </form>
    </div>
  );
}

function FormSection({ title, icon, className, children }: { title: string; icon: React.ReactNode; className: string; children: React.ReactNode }) {
  return <section className={`record-form-section ${className}`}><h3>{icon}{title}</h3><div className="record-form-grid">{children}</div></section>;
}

function Field({ label, wide, required, children }: { label: string; wide?: boolean; required?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "record-field wide" : "record-field"}><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}</label>;
}
