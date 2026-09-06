"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileX,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { AnimatedNumber } from "@/components/animated-number";
import { DeleteRecordDialog } from "@/components/person-record-dialog";
import { FinancialRecordDialog, FinancialRecordValues } from "@/components/financial-record-dialog";
import { toast } from "sonner";
import { NumberSkeleton, TableSkeleton } from "@/components/skeleton";
import { visiblePageNumbers } from "@/lib/pagination";

type FinancialTransaction = {
  id: string;
  type: "income" | "expense";
  description: string;
  category: string;
  counterparty?: string;
  amount: string;
  status: "paid" | "pending";
  transactionDate: string;
  paymentMethod?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  notes?: string;
};

const pageSize = 8;

export default function FinancePage() {
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [attachment, setAttachment] = useState("all");
  const [page, setPage] = useState(1);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view" | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<FinancialTransaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FinancialTransaction | null>(null);

  async function loadTransactions() {
    setLoading(true);
    try {
      const response = await fetch("/api/financeiro", { cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao carregar lançamentos");
      setTransactions(await response.json());
    } catch {
      toast.error("Não foi possível carregar os lançamentos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTransactions(); }, []);

  const categories = useMemo(() => [...new Set(transactions.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "pt-BR")), [transactions]);

  const filteredTransactions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return transactions.filter((item) => {
      const matchesSearch = !term || `${item.description} ${item.counterparty ?? ""}`.toLocaleLowerCase("pt-BR").includes(term);
      return matchesSearch
        && (type === "all" || item.type === type)
        && (status === "all" || item.status === status)
        && (category === "all" || item.category === category)
        && (attachment === "all" || (attachment === "with" ? Boolean(item.attachmentUrl) : !item.attachmentUrl));
    });
  }, [attachment, category, search, status, transactions, type]);

  const pageCount = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleTransactions = filteredTransactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const start = filteredTransactions.length ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, filteredTransactions.length);

  const totalIncome = useMemo(() => sumAmount(transactions.filter((item) => item.type === "income" && item.status === "paid")), [transactions]);
  const totalExpense = useMemo(() => sumAmount(transactions.filter((item) => item.type === "expense" && item.status === "paid")), [transactions]);
  const pendingCount = useMemo(() => transactions.filter((item) => item.status === "pending").length, [transactions]);
  const availableBalance = totalIncome - totalExpense;

  function updateFilter(action: () => void) {
    action();
    setPage(1);
  }

  function clearFilters() {
    setSearch(""); setType("all"); setStatus("all"); setCategory("all"); setAttachment("all"); setPage(1);
  }

  async function saveTransaction(values: FinancialRecordValues) {
    const editing = dialogMode === "edit" && selectedTransaction;
    const response = await fetch(editing ? `/api/financeiro/${selectedTransaction.id}` : "/api/financeiro", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      toast.error(body?.error ?? "Não foi possível salvar o lançamento");
      return false;
    }
    toast.success(editing ? "Lançamento alterado com sucesso" : "Lançamento cadastrado com sucesso");
    setDialogMode(null); setSelectedTransaction(null); setPage(1);
    await loadTransactions();
    return true;
  }

  async function confirmDelete() {
    if (!deleteTarget) return false;
    const response = await fetch(`/api/financeiro/${deleteTarget.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Não foi possível excluir o lançamento");
      return false;
    }
    toast.error("Lançamento excluído com sucesso");
    setDeleteTarget(null);
    await loadTransactions();
    return true;
  }

  return (
    <DashboardShell title="Financeiro">
      <main className="finance-main">
        <section className="resource-heading">
          <div><h2>Gestão Financeira</h2><p>Acompanhe entradas, saídas, pendências e comprovantes das movimentações.</p></div>
          <button className="primary-action" onClick={() => { setSelectedTransaction(null); setDialogMode("create"); }}><Plus />Novo Lançamento</button>
        </section>

        <section className="resource-stats finance-summary" aria-label="Resumo financeiro">
          <article><span className="neutral"><Wallet /></span><small>Saldo disponível</small><strong>{loading ? <NumberSkeleton /> : <AnimatedNumber value={Math.abs(availableBalance)} prefix={availableBalance < 0 ? "-R$ " : "R$ "} decimals={2} />}</strong></article>
          <article><span className="green"><ArrowUpCircle /></span><small>Entradas</small><strong>{loading ? <NumberSkeleton /> : <AnimatedNumber value={totalIncome} prefix="R$ " decimals={2} />}</strong></article>
          <article><span className="red"><ArrowDownCircle /></span><small>Saídas</small><strong>{loading ? <NumberSkeleton /> : <AnimatedNumber value={totalExpense} prefix="R$ " decimals={2} />}</strong></article>
          <article><span className="amber"><Clock /></span><small>Pendências</small><strong>{loading ? <NumberSkeleton /> : <AnimatedNumber value={pendingCount} />}</strong></article>
        </section>

        <section className="finance-content">
          <div className="member-filters resource-filters">
            <select aria-label="Filtrar por tipo" value={type} onChange={(event) => updateFilter(() => setType(event.target.value))}>
              <option value="all">Tipo: Todos</option>
              <option value="income">Entrada</option>
              <option value="expense">Saída</option>
            </select>
            <select aria-label="Filtrar por status" value={status} onChange={(event) => updateFilter(() => setStatus(event.target.value))}>
              <option value="all">Status: Todos</option>
              <option value="paid">Pago</option>
              <option value="pending">Pendente</option>
            </select>
            <select aria-label="Filtrar por categoria" value={category} onChange={(event) => updateFilter(() => setCategory(event.target.value))}>
              <option value="all">Categoria: Todas</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select aria-label="Filtrar por comprovante" value={attachment} onChange={(event) => updateFilter(() => setAttachment(event.target.value))}>
              <option value="all">Comprovante: Todos</option>
              <option value="with">Com comprovante</option>
              <option value="without">Sem comprovante</option>
            </select>
            <label className="member-filter-search"><Search /><input value={search} onChange={(event) => updateFilter(() => setSearch(event.target.value))} placeholder="Filtrar por descrição..." /></label>
            <button className="clear-filters" onClick={clearFilters}>Limpar Filtros</button>
          </div>

          <div className="members-table-card">
            <div className="members-table-scroll">
              <table className="members-table finance-table">
                <colgroup>
                  <col className="finance-col-description" />
                  <col className="finance-col-category" />
                  <col className="finance-col-type" />
                  <col className="finance-col-amount" />
                  <col className="finance-col-date" />
                  <col className="finance-col-status" />
                  <col className="finance-col-attachment" />
                  <col className="finance-col-actions" />
                </colgroup>
                <thead><tr><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Valor</th><th>Data</th><th>Status</th><th>Comprovante</th><th>Ações</th></tr></thead>
                <tbody>
                  {visibleTransactions.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Descrição"><div className="finance-identity"><strong>{item.description}</strong>{item.counterparty && <small>{item.type === "income" ? "De: " : "Para: "}{item.counterparty}</small>}</div></td>
                      <td data-label="Categoria"><span className="cell-tag">{item.category}</span></td>
                      <td data-label="Tipo"><span className={`finance-type-tag ${item.type}`}>{item.type === "income" ? <ArrowUpCircle /> : <ArrowDownCircle />}{item.type === "income" ? "Entrada" : "Saída"}</span></td>
                      <td data-label="Valor" className={`finance-amount ${item.type}`}>{item.type === "expense" ? "- " : ""}{formatCurrency(Number(item.amount))}</td>
                      <td data-label="Data" className="admission-date">{formatDate(item.transactionDate)}</td>
                      <td data-label="Status"><span className={`status-tag ${item.status === "paid" ? "is-active" : "is-inactive"}`}><i />{item.status === "paid" ? "Pago" : "Pendente"}</span></td>
                      <td data-label="Comprovante">
                        {item.attachmentUrl
                          ? <a className="finance-attachment-link" href={item.attachmentUrl} target="_blank" rel="noreferrer" aria-label={`Abrir comprovante de ${item.description}`}><Paperclip /></a>
                          : <span className="finance-attachment-none" aria-label="Sem comprovante"><FileX /></span>}
                      </td>
                      <td data-label="Ações"><div className="member-actions"><button aria-label={`Visualizar ${item.description}`} onClick={() => { setSelectedTransaction(item); setDialogMode("view"); }}><Eye /></button><button aria-label={`Editar ${item.description}`} onClick={() => { setSelectedTransaction(item); setDialogMode("edit"); }}><Pencil /></button><button aria-label={`Excluir ${item.description}`} onClick={() => setDeleteTarget(item)}><Trash2 /></button></div></td>
                    </tr>
                  ))}
                  {!loading && !visibleTransactions.length && <tr><td className="members-empty" colSpan={8}>Nenhum lançamento encontrado com esses filtros.</td></tr>}
                </tbody>
              </table>
            </div>
            {loading && <TableSkeleton rows={8} columns={6} />}
            <div className="members-pagination">
              <span>Mostrando {start}-{end} de {filteredTransactions.length} lançamentos</span>
              <div>
                <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Página anterior"><ChevronLeft /></button>
                {visiblePageNumbers(currentPage, pageCount).map((number) => <button className={number === currentPage ? "current" : undefined} onClick={() => setPage(number)} key={number}>{number}</button>)}
                <button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Próxima página"><ChevronRight /></button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <FinancialRecordDialog open={dialogMode !== null} mode={dialogMode ?? "create"} initialValues={selectedTransaction ? transactionValues(selectedTransaction) : undefined} onClose={() => { setDialogMode(null); setSelectedTransaction(null); }} onSubmit={saveTransaction} />
      <DeleteRecordDialog open={deleteTarget !== null} name={deleteTarget?.description ?? ""} kind="financial" onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    </DashboardShell>
  );
}

function sumAmount(items: FinancialTransaction[]) {
  return items.reduce((total, item) => total + Number(item.amount), 0);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)).replace(/\./g, "").replace(/\s+de\s+/g, " ");
}

function transactionValues(item: FinancialTransaction): Partial<FinancialRecordValues> {
  return {
    type: item.type,
    description: item.description,
    category: item.category,
    counterparty: item.counterparty ?? "",
    amount: item.amount,
    status: item.status,
    transactionDate: item.transactionDate.slice(0, 10),
    paymentMethod: item.paymentMethod ?? "",
    attachmentUrl: item.attachmentUrl ?? "",
    attachmentName: item.attachmentName ?? "",
    notes: item.notes ?? "",
  };
}
