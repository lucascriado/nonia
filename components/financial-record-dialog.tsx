"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, CalendarDays, CreditCard, LoaderCircle, Paperclip, Save, Tag, X } from "lucide-react";
import { expenseCategories, incomeCategories, paymentMethods, ATTACHMENT_MAX_BYTES } from "@/lib/finance-records";

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
};

const emptyValues: FinancialRecordValues = {
  type: "income",
  description: "",
  category: incomeCategories[0],
  counterparty: "",
  amount: "",
  status: "paid",
  transactionDate: new Date().toISOString().slice(0, 10),
  paymentMethod: "",
  attachmentUrl: "",
  attachmentName: "",
  notes: "",
};

function normalizeValues(initialValues?: Partial<FinancialRecordValues>) {
  const normalized = { ...emptyValues };
  for (const key of Object.keys(emptyValues) as Array<keyof FinancialRecordValues>) {
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
  const [values, setValues] = useState<FinancialRecordValues>(() => normalizeValues(initialValues));
  const [submitting, setSubmitting] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");

  useEffect(() => {
    if (open) {
      setValues(normalizeValues(initialValues));
      setSubmitting(false);
      setAttachmentError("");
    }
  }, [initialValues, open]);

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

  function update(field: keyof FinancialRecordValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
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
      await onSubmit(values);
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
            <Field label="Forma de Pagamento"><select value={values.paymentMethod} onChange={(event) => update("paymentMethod", event.target.value)}><option value="">Selecione</option>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></Field>
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
