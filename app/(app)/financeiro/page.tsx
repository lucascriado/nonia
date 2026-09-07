"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Filter,
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
import { FirstLoad } from "@/components/first-load";
import { FirstRun } from "@/components/first-run";
import { HttpError, LoadFailure } from "@/components/load-failure";
import { READ_ONLY_REASON, usePermission, useReadOnly } from "@/components/current-user";
import { FilterDisclosure } from "@/components/filter-disclosure";
import { ExportButton } from "@/components/export-button";
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
  hasAttachment?: boolean;
  attachmentName?: string;
  /** Só vem da ficha individual, nunca da listagem. */
  attachmentUrl?: string;
  notes?: string;
};

type Summary = { income: string; expense: string; balance: string; pendingCount: number; pendingAmount: string };

const pageSize = 8;

export default function FinancePage() {
  const readOnly = useReadOnly();
  /** Sem a permissão de escrita o botão não existe: o servidor recusaria. */
  const canWrite = usePermission("finance.write");

  /**
   * Abre a ficha buscando o registro COMPLETO.
   *
   * A listagem devolve só `hasAttachment` e o nome do arquivo — o comprovante
   * em si não vem, senão cem lançamentos virariam megabytes. Abrir o
   * formulário com o objeto da lista mostraria "Anexar comprovante" para um
   * lançamento que já tem um, e quem anexasse outro substituiria o existente
   * sem saber.
   */
  async function openRecord(item: FinancialTransaction, mode: "view" | "edit") {
    setSelectedTransaction(item);
    setDialogMode(mode);
    try {
      const response = await fetch(`/api/financeiro/${item.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const full = await response.json();
      setSelectedTransaction((current) => (current && current.id === item.id ? { ...current, ...full } : current));
    } catch {
      // Sem a ficha completa o formulário abre com o que a lista tem. O
      // servidor ignora chave ausente, então salvar não apaga o comprovante.
    }
  }
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary>({ income: "0", expense: "0", balance: "0", pendingCount: 0, pendingAmount: "0" });
  const [loading, setLoading] = useState(true);
  /** Status HTTP da última leitura que falhou, ou `null`. Ver LoadFailure. */
  const [failed, setFailed] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [attachment, setAttachment] = useState("all");
  const [page, setPage] = useState(1);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view" | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<FinancialTransaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FinancialTransaction | null>(null);

  /**
   * Filtro e paginação são do SERVIDOR, e o `summary` vem junto — do conjunto
   * FILTRADO, na mesma consulta. Somar a partir da lista daria o total da
   * página, não o da igreja, e sem quebrar nada: os números continuariam
   * aparecendo, só que errados.
   */
  const listQuery = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) query.set("search", search.trim());
    if (type !== "all") query.set("type", type);
    if (status !== "all") query.set("status", status);
    if (category !== "all") query.set("category", category);
    if (attachment !== "all") query.set("attachment", attachment);
    return query.toString();
  }, [attachment, category, page, search, status, type]);

  const loadTransactions = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/financeiro?${query}`, { cache: "no-store" });
      if (!response.ok) throw new HttpError(response.status, "Falha ao carregar lançamentos");
      const payload = await response.json() as { records: FinancialTransaction[]; total: number; summary: Summary };
      setTransactions(payload.records);
      setTotal(payload.total);
      setSummary(payload.summary);
      setFailed(null);
    } catch (error) {
      // O motivo fica na tela, não só no toast: quem chegou aqui por troca de
      // igreja precisa saber que é o papel, e não a lista, que mudou.
      setFailed(error instanceof HttpError ? error.status : 0);
      toast.error("Não foi possível carregar os lançamentos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // CARREGANDO COMEÇA AQUI, não dentro do fetch. Entre a troca de aba e o
    // disparo da requisição havia pelo menos um quadro com `loading` falso e a
    // lista ainda sem os dados novos -- e nesse quadro o estado vazio
    // aparecia. É o mesmo defeito do 403: a tela afirmando ausência sem ter a
    // resposta. Com a busca, o intervalo era de 300ms inteiros.
    setLoading(true);
    const delay = search.trim() ? 300 : 0;
    const timer = window.setTimeout(() => void loadTransactions(listQuery), delay);
    return () => window.clearTimeout(timer);
  }, [listQuery, loadTransactions, search]);

  // As categorias não podem sair da página: viriam só as que aparecem nela.
  const [categories, setCategories] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/financeiro?pageSize=100", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active || !payload) return;
        const list = (payload.records as FinancialTransaction[]).map((item) => item.category);
        setCategories([...new Set(list)].sort((a, b) => a.localeCompare(b, "pt-BR")));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleTransactions = transactions;
  /**
   * Releitura COM conteúdo anterior na tela: trocar de aba ou de página não
   * pode apagar a lista e pôr esqueleto no lugar. O esqueleto é para quando
   * não há o que manter; havendo, a lista antiga fica visível e apagada até a
   * nova chegar, e a pessoa não perde o contexto nem vê a tela piscar.
   */
  const refreshing = loading && visibleTransactions.length > 0;
  const start = total ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, total);

  // Os valores chegam como string com duas casas, de propósito: converter só
  // na hora de exibir evita perder centavo em float.
  const totalIncome = Number(summary.income);
  const totalExpense = Number(summary.expense);
  const availableBalance = Number(summary.balance);
  const pendingCount = summary.pendingCount;


  function updateFilter(action: () => void) {
    action();
    setPage(1);
  }

  const activeFilters = [type !== "all", status !== "all", category !== "all", attachment !== "all", search.trim() !== ""].filter(Boolean).length;

  /** Sem NENHUM lançamento e sem filtro: a tela vira primeira vez. */
  const firstRun = !loading && failed === null && total === 0 && activeFilters === 0;
  /* O terceiro estado: ainda NÃO SABEMOS se há registro.
     Sem ele, `firstRun` é falso enquanto carrega e o ramo de baixo desenha a
     tela cheia -- indicadores rotulados, filtros e abas -- que some quando a
     resposta chega vazia. Ver components/first-load.tsx. */
  const aguardando = loading && failed === null && !visibleTransactions.length && activeFilters === 0;

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
    await loadTransactions(listQuery);
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
    await loadTransactions(listQuery);
    return true;
  }

  return (
    <DashboardShell title="Financeiro">
      <main className="finance-main">
        {/* Sem título aqui: ele vive na BARRA DO TOPO, e só lá. A faixa de
            ações FICA -- ela é o que esta seção passa a ser. Ver
            components/header.tsx, que monta título e legenda de `searchItems`. */}
        <section className="resource-heading is-acoes">
          <ExportButton resource="financeiro" permission="finance.read" filters={{ search, type, status, category, attachment }} />
          {canWrite && <button disabled={readOnly} title={readOnly ? READ_ONLY_REASON : undefined} className="primary-action" onClick={() => { setSelectedTransaction(null); setDialogMode("create"); }}><Plus />Novo Lançamento</button>}
        </section>

        {!firstRun && (
        <>
        {/* O resumo acompanha o filtro: filtrando por "Aluguel", o saldo é o do
            Aluguel, não o da igreja. Sem dizer isso, a pessoa vê o saldo mudar
            e acha que perdeu lançamento. */}
        {activeFilters > 0 && (
          <p className="finance-summary-scope">
            <Filter aria-hidden />
            Os valores abaixo são do filtro aplicado, não do total da igreja.
          </p>
        )}
        <section className="resource-stats finance-summary" aria-label="Resumo financeiro">
          <article><span className="neutral"><Wallet /></span><small>Saldo disponível</small><strong>{loading && !refreshing ? <NumberSkeleton /> : <AnimatedNumber value={Math.abs(availableBalance)} prefix={availableBalance < 0 ? "-R$ " : "R$ "} decimals={2} />}</strong></article>
          <article><span className="green"><ArrowUpCircle /></span><small>Entradas</small><strong>{loading && !refreshing ? <NumberSkeleton /> : <AnimatedNumber value={totalIncome} prefix="R$ " decimals={2} />}</strong></article>
          <article><span className="red"><ArrowDownCircle /></span><small>Saídas</small><strong>{loading && !refreshing ? <NumberSkeleton /> : <AnimatedNumber value={totalExpense} prefix="R$ " decimals={2} />}</strong></article>
          <article><span className="amber"><Clock /></span><small>Pendências</small><strong>{loading && !refreshing ? <NumberSkeleton /> : <AnimatedNumber value={pendingCount} />}</strong></article>
        </section>

        </>
        )}

        {failed !== null ? (
          <LoadFailure onRetry={() => void loadTransactions(listQuery)} status={failed} />
        ) : aguardando ? (
          <FirstLoad label="Carregando os lançamentos" />
        ) : firstRun ? (
          <FirstRun
            action={
              readOnly ? undefined : (
                <button className="primary-action" onClick={() => { setSelectedTransaction(null); setDialogMode("create"); }} type="button">
                  <Plus />Registrar o primeiro lançamento
                </button>
              )
            }
            icon={Wallet}
            text="Registre dízimos, ofertas e despesas com o comprovante anexado. O saldo e a prestação de contas aparecem aqui assim que o primeiro lançamento entrar."
            title="Nenhum lançamento ainda"
          />
        ) : (
        <section className="finance-content">
          <FilterDisclosure activeCount={activeFilters}>
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
          </FilterDisclosure>

          <div aria-busy={refreshing} className={`members-table-card${refreshing ? " is-refreshing" : ""}`}>
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
                        {/* A listagem não traz mais o arquivo, só se existe e o
                            nome — 100 registros com anexo embutido eram
                            megabytes. Abrir o comprovante é pela ficha. */}
                        {item.hasAttachment
                          ? <span className="finance-attachment-link" title={item.attachmentName ? `Comprovante: ${item.attachmentName}` : "Tem comprovante"} aria-label={`${item.description} tem comprovante anexado`}><Paperclip /></span>
                          : <span className="finance-attachment-none" aria-label="Sem comprovante"><FileX /></span>}
                      </td>
                      <td data-label="Ações"><div className="member-actions"><button aria-label={`Visualizar ${item.description}`} onClick={() => openRecord(item, "view")}><Eye /></button>{canWrite && <><button aria-label={`Editar ${item.description}`} disabled={readOnly} title={readOnly ? READ_ONLY_REASON : undefined} onClick={() => openRecord(item, "edit")}><Pencil /></button><button aria-label={`Excluir ${item.description}`} disabled={readOnly} title={readOnly ? READ_ONLY_REASON : undefined} onClick={() => setDeleteTarget(item)}><Trash2 /></button></>}</div></td>
                    </tr>
                  ))}
                  {/* A escolha da frase vem dos FILTROS, não do tamanho do array: desde que a
                      paginação foi para o servidor, `transactions` e a lista visível são
                      o MESMO array, então filtrar e não achar nada dizia "esta igreja
                      não tem cadastro nenhum" -- afirmação sobre a igreja a partir de
                      um filtro. O estado de primeira vez, esse, é o bloco lá em cima. */}
                  {!loading && !visibleTransactions.length && <tr><td className="members-empty" colSpan={8}>{activeFilters > 0 ? "Nenhum lançamento encontrado com esses filtros." : "Nenhum lançamento registrado ainda. Comece pelo botão Novo Lançamento."}</td></tr>}
                </tbody>
              </table>
            </div>
            {loading && !refreshing && <TableSkeleton rows={8} columns={6} />}
            <div className="members-pagination">
              <span>Mostrando {start}-{end} de {total} lançamentos</span>
              <div>
                <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Página anterior"><ChevronLeft /></button>
                {visiblePageNumbers(currentPage, pageCount).map((number) => <button className={number === currentPage ? "current" : undefined} onClick={() => setPage(number)} key={number}>{number}</button>)}
                <button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Próxima página"><ChevronRight /></button>
              </div>
            </div>
          </div>
        </section>
        )}
      </main>
      <FinancialRecordDialog open={dialogMode !== null} mode={dialogMode ?? "create"} initialValues={selectedTransaction ? transactionValues(selectedTransaction) : undefined} onClose={() => { setDialogMode(null); setSelectedTransaction(null); }} onSubmit={saveTransaction} />
      <DeleteRecordDialog open={deleteTarget !== null} name={deleteTarget?.description ?? ""} kind="financial" onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    </DashboardShell>
  );
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
