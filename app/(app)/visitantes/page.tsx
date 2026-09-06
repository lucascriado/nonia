"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  Pencil,
  PartyPopper,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { FirstRun } from "@/components/first-run";
import { HttpError, LoadFailure } from "@/components/load-failure";
import { usePermission, useReadOnly } from "@/components/current-user";
import { ExportButton } from "@/components/export-button";
import { FilterDisclosure } from "@/components/filter-disclosure";
import { AnimatedNumber } from "@/components/animated-number";
import { ConfirmConvertDialog, DeleteRecordDialog, PersonRecordDialog, PersonRecordValues } from "@/components/person-record-dialog";
import { toast } from "sonner";
import { NumberSkeleton, TableSkeleton } from "@/components/skeleton";
import { visiblePageNumbers } from "@/lib/pagination";

type Visitor = {
  id: string;
  initials: string;
  name: string;
  email: string;
  hasPhoto?: boolean;
  /** Só vem da ficha individual, nunca da listagem. */
  photoDataUrl?: string;
  date: string;
  invitedBy: string;
  membershipStage: "Visitou a igreja" | "Contato realizado" | "Visita em casa" | "Batismo" | "Membro";
  phone?: string;
  birthDate?: string;
  gender?: string;
  civilStatus?: string;
  cpf?: string;
  zipCode?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  notes?: string;
};

const pageSize = 4;
/**
 * A faixa de indicadores, contada pelo SERVIDOR na mesma consulta da página e
 * com o MESMO filtro — inclusive a aba. Ela resume o que está na tela, não a
 * igreja inteira.
 */
type Summary = { firstVisit: number; integrating: number; markedAsMember: number };

const tabs = ["Todos", "Recentes", "Pendentes"] as const;
const membershipStages: Visitor["membershipStage"][] = ["Visitou a igreja", "Contato realizado", "Visita em casa", "Batismo", "Membro"];
type Tab = typeof tabs[number];

export default function VisitorsPage() {
  const readOnly = useReadOnly();
  /** Sem a permissão de escrita o botão não existe: o servidor recusaria. */
  const canWrite = usePermission("visitors.write");

  /**
   * Abre a ficha buscando o registro COMPLETO.
   *
   * A listagem devolve só `hasPhoto` — a foto em si não vem, senão cem
   * cadastros virariam megabytes. Abrir o formulário com o objeto da lista
   * mostraria "sem foto" para quem tem uma, e quem salvasse depois de trocar
   * só o telefone poderia achar que a foto se perdeu.
   */
  async function openRecord(record: Visitor, mode: "view" | "edit") {
    setSelectedVisitor(record);
    setDialogMode(mode);
    try {
      const response = await fetch(`/api/visitors/${record.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const full = await response.json();
      setSelectedVisitor((current) => (current && current.id === record.id ? { ...current, ...full } : current));
    } catch {
      // Sem a ficha completa o formulário abre com o que a lista tem. O
      // servidor ignora chave ausente, então salvar não apaga a foto.
    }
  }
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [total, setTotal] = useState(0);
  const [inviters, setInviters] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary>({ firstVisit: 0, integrating: 0, markedAsMember: 0 });
  const [loading, setLoading] = useState(true);
  /** Status HTTP da última leitura que falhou, ou `null`. Ver LoadFailure. */
  const [failed, setFailed] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("Todos");
  const [invitedBy, setInvitedBy] = useState("all");
  const [page, setPage] = useState(1);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view" | null>(null);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Visitor | null>(null);
  const [convertTarget, setConvertTarget] = useState<Visitor | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  // A aba fica fora da conta: ela continua visível fora do disclosure.
  const activeFilters = [invitedBy !== "all", search.trim() !== ""].filter(Boolean).length;

  /** Sem NENHUM visitante e sem filtro nem aba: vira primeira vez. */
  const firstRun = !loading && failed === null && total === 0 && activeFilters === 0 && tab === "Todos";

  /**
   * Filtro, aba e paginação são do SERVIDOR. A lista em memória é uma PÁGINA:
   * contar a partir dela daria "25 de 137" sem ninguém perceber.
   */
  const listQuery = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) query.set("search", search.trim());
    if (tab !== "Todos") query.set("tab", tab);
    if (invitedBy !== "all") query.set("invitedBy", invitedBy);
    return query.toString();
  }, [invitedBy, page, search, tab]);

  const loadVisitors = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/visitors?${query}`, { cache: "no-store" });
      if (!response.ok) throw new HttpError(response.status, "Falha ao carregar visitantes");
      const payload = await response.json() as {
        records: Array<Omit<Visitor, "initials" | "membershipStage" | "date"> & { membershipStage?: string; date: string }>;
        total: number;
        summary: Summary;
      };
      setTotal(payload.total);
      setSummary(payload.summary);
      const records = payload.records;
      setVisitors(records.map((visitor) => ({ ...visitor, initials: initialsFrom(visitor.name), membershipStage: membershipStageFromDb(visitor.membershipStage), date: formatDate(visitor.date) })));
      setFailed(null);
    } catch (error) {
      // O motivo fica na tela, não só no toast: quem chegou aqui por troca de
      // igreja precisa saber que é o papel, e não a lista, que mudou.
      setFailed(error instanceof HttpError ? error.status : 0);
      toast.error("Não foi possível carregar os visitantes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const delay = search.trim() ? 300 : 0;
    const timer = window.setTimeout(() => void loadVisitors(listQuery), delay);
    return () => window.clearTimeout(timer);
  }, [listQuery, loadVisitors, search]);

  // Quem convidou não pode sair da página: a lista viria incompleta.
  useEffect(() => {
    let active = true;
    fetch("/api/visitors?pageSize=100", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active || !payload) return;
        setInviters([...new Set((payload.records as Array<{ invitedBy: string }>).map((v) => v.invitedBy).filter(Boolean))]);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = visitors;
  const start = total ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, total);

  function changeTab(nextTab: Tab) {
    setTab(nextTab);
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setInvitedBy("all");
    setTab("Todos");
    setPage(1);
  }

  async function saveVisitor(values: PersonRecordValues) {
    const editing = dialogMode === "edit" && selectedVisitor;
    const response = await fetch(editing ? `/api/visitors/${selectedVisitor.id}` : "/api/visitors", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      toast.error("Não foi possível salvar o visitante");
      return false;
    }
    toast.success(editing ? "Visitante alterado com sucesso" : "Visitante cadastrado com sucesso");
    setDialogMode(null); setSelectedVisitor(null); setPage(1);
    await loadVisitors(listQuery);
    return true;
  }

  async function confirmDelete() {
    if (!deleteTarget) return false;
    const response = await fetch(`/api/visitors/${deleteTarget.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Não foi possível excluir o visitante");
      return false;
    }
    toast.error("Visitante excluído com sucesso");
    setDeleteTarget(null);
    await loadVisitors(listQuery);
    return true;
  }

  async function confirmConvert() {
    if (!convertTarget) return false;
    if (convertingId) return false;
    setConvertingId(convertTarget.id);
    try {
      const response = await fetch(`/api/visitors/${convertTarget.id}/convert`, { method: "POST" });
      if (!response.ok) throw new Error("Falha ao converter visitante");
      toast.success("Visitante convertido em membro");
      setConvertTarget(null);
      setPage(1);
      await loadVisitors(listQuery);
      return true;
    } catch {
      toast.error("Não foi possível converter o visitante");
      return false;
    } finally {
      setConvertingId(null);
    }
  }

  return (
    <DashboardShell title="Visitantes">
      <main className="visitors-main">
        <section className="visitors-heading">
          <div><h2>Gestão de Visitantes</h2><p>Acompanhe e integre novas pessoas à nossa comunidade.</p></div>
          <ExportButton resource="visitors" permission="visitors.read" filters={{ search, tab, invitedBy }} />
          {canWrite && <button disabled={readOnly} title={readOnly ? "A conta está em somente leitura por mensalidade em aberto. Regularize para voltar a cadastrar." : undefined} className="primary-action visitor-action" onClick={() => { setSelectedVisitor(null); setDialogMode("create"); }}><UserPlus />Novo Visitante</button>}
        </section>

        {failed !== null ? (
          <LoadFailure onRetry={() => void loadVisitors(listQuery)} status={failed} />
        ) : firstRun ? (
          <FirstRun
            action={
              readOnly ? undefined : (
                <button className="primary-action" onClick={() => { setSelectedVisitor(null); setDialogMode("create"); }} type="button">
                  <UserPlus />Registrar o primeiro visitante
                </button>
              )
            }
            icon={UserPlus}
            text="Anote quem visitou a igreja. A partir daí você acompanha em que ponto da integração cada pessoa está, até virar membro."
            title="Nenhum visitante registrado ainda"
          />
        ) : (
        <>
        {/* A aba conta como filtro: em "Pendentes" os outros dois indicadores
            zeram por construção, porque a aba já os tirou da lista. Zero certo
            sem explicação parece defeito; com a frase, é informação. */}
        {(activeFilters > 0 || tab !== "Todos") && <p className="stats-caption">Números do que está filtrado, não da igreja inteira.</p>}
        <section className="visitor-stats" aria-label="Indicadores de visitantes">
          <VisitorStat loading={loading} label="Total de visitantes" value={total} color="default" />
          <VisitorStat loading={loading} label="Primeira visita" value={summary.firstVisit} detail="Novo" color="new" />
          <VisitorStat loading={loading} label="Em integração" value={summary.integrating} color="default" />
          {/* NÃO é "quantos viraram membros": converter visitante em membro
              APAGA a linha daqui, então quem virou não está mais nesta lista.
              O que este número conta é quem foi MARCADO como membro e ninguém
              converteu — uma fila de pendências, e o rótulo antigo dizia o
              oposto disso. */}
          <VisitorStat loading={loading} label="Marcados como membro" value={summary.markedAsMember} color="default" />
        </section>

        <FilterDisclosure activeCount={activeFilters}>
          <div className="member-filters visitor-filters">
            <select aria-label="Filtrar por responsável pelo convite" value={invitedBy} onChange={(event) => { setInvitedBy(event.target.value); setPage(1); }}>
              <option value="all">Quem convidou: Todos</option>
              {inviters.map((item) => <option key={item}>{item}</option>)}
            </select>
            <label className="member-filter-search"><Search /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Filtrar visitante..." /></label>
            <button className="clear-filters" onClick={clearFilters}>Limpar Filtros</button>
          </div>
        </FilterDisclosure>

        <section className="visitors-table-card">
          <div className="visitor-table-toolbar">
            <div className="visitor-tabs">
              {tabs.map((item) => <button className={tab === item ? "active" : undefined} key={item} onClick={() => changeTab(item)}>{item}</button>)}
            </div>
          </div>
          <div className="visitors-table-scroll">
            <table className="visitors-table">
              <colgroup><col className="visitor-col-name" /><col className="visitor-col-date" /><col className="visitor-col-invited" /><col className="visitor-col-status" /><col className="visitor-col-actions" /></colgroup>
              <thead><tr><th>Nome do Visitante</th><th>Data da Visita</th><th>Quem Convidou</th><th>Membresia</th><th>Ações</th></tr></thead>
              <tbody>
                {visible.map((visitor, index) => (
                  <tr key={visitor.email}>
                    <td data-label="Visitante"><div className="visitor-identity"><span className={`visitor-avatar avatar-${index % 4}`}>{visitor.initials}</span><span><strong>{visitor.name}</strong><small>{visitor.email}</small></span></div></td>
                    <td data-label="Data">{visitor.date}</td>
                    <td data-label="Quem convidou"><span className="invited-by"><Users />{visitor.invitedBy}</span></td>
                    <td data-label="Progresso"><div className="visitor-status-cell"><MembershipProgress stage={visitor.membershipStage} /></div></td>
                    <td data-label="Ações">
                      <div className="member-actions">
                        <button aria-label={`Visualizar ${visitor.name}`} onClick={() => openRecord(visitor, "view")}><Eye /></button>
                        <button aria-label={`Converter ${visitor.name} em membro`} disabled={convertingId === visitor.id} onClick={() => setConvertTarget(visitor)}><UserCheck /></button><button aria-label={`Editar ${visitor.name}`} onClick={() => openRecord(visitor, "edit")}><Pencil /></button>
                        <button aria-label={`Excluir ${visitor.name}`} onClick={() => setDeleteTarget(visitor)}><Trash2 /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !visible.length && <div className="members-empty">{visitors.length ? "Nenhum visitante encontrado com esses filtros." : "Nenhum visitante cadastrado ainda. Registre quem visitou a igreja pelo botão Novo Visitante."}</div>}
          </div>
          {loading && <TableSkeleton rows={4} columns={5} />}
          <div className="visitor-pagination">
            <span>Mostrando {start}-{end} de {total} visitantes</span>
            <div><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft /></button>{visiblePageNumbers(currentPage, pageCount).map((number) => <button className={number === currentPage ? "current" : undefined} key={number} onClick={() => setPage(number)}>{number}</button>)}<button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight /></button></div>
          </div>
        </section>

        <section className="visitor-followup">
          <article className="integration-guide"><h3>Próximos Passos na Integração</h3><p>Lembre-se que o primeiro contato deve ser feito em até 48h após a visita para garantir uma maior taxa de retenção.</p><button><ClipboardList />Ver Manual de Integração</button></article>
        </section>
        </>
        )}
      </main>
      <PersonRecordDialog open={dialogMode !== null} mode={dialogMode ?? "create"} kind="visitor" initialValues={selectedVisitor ? visitorValues(selectedVisitor) : { membershipStage: "Visitou a igreja" }} onClose={() => { setDialogMode(null); setSelectedVisitor(null); }} onSubmit={saveVisitor} />
      <DeleteRecordDialog open={deleteTarget !== null} name={deleteTarget?.name ?? ""} kind="visitor" onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
      <ConfirmConvertDialog open={convertTarget !== null} name={convertTarget?.name ?? ""} onClose={() => setConvertTarget(null)} onConfirm={confirmConvert} />
    </DashboardShell>
  );
}

function initialsFrom(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function membershipStageFromDb(stage?: string): Visitor["membershipStage"] {
  if (stage === "member") return "Membro";
  if (stage === "baptism") return "Batismo";
  if (stage === "home_visit") return "Visita em casa";
  if (stage === "contacted") return "Contato realizado";
  return "Visitou a igreja";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)).replace(/\./g, "").replace(/\s+de\s+/g, " ");
}

function visitorValues(visitor: Visitor): Partial<PersonRecordValues> {
  return { name: visitor.name, email: visitor.email, phone: visitor.phone, birthDate: visitor.birthDate?.slice(0, 10), gender: visitor.gender, civilStatus: visitor.civilStatus, cpf: visitor.cpf, zipCode: visitor.zipCode, address: visitor.address, neighborhood: visitor.neighborhood, city: visitor.city, state: visitor.state, notes: visitor.notes, invitedBy: visitor.invitedBy, membershipStage: visitor.membershipStage, photoDataUrl: visitor.photoDataUrl };
}

function VisitorStat({ label, value, detail, icon, color, loading }: { label: string; value: number; detail?: React.ReactNode; icon?: React.ReactNode; color: string; loading: boolean }) {
  return <article className={`visitor-stat ${color}`}><small>{label}</small><div><strong>{loading ? <NumberSkeleton /> : <AnimatedNumber value={value} />}</strong>{!loading && detail && <span>{detail}</span>}{icon && <i>{icon}</i>}</div></article>;
}

function MembershipProgress({ stage }: { stage: Visitor["membershipStage"] }) {
  const currentIndex = Math.max(0, membershipStages.indexOf(stage));
  return (
    <div className="visitor-membership-progress" aria-label={`Membresia: ${stage}`}>
      <span>{stage}</span>
      <div>{membershipStages.map((item, index) => <i className={index <= currentIndex ? "reached" : undefined} key={item} />)}</div>
    </div>
  );
}
