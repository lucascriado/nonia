"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Droplets, Eye, HeartHandshake, Landmark, Pencil, Plus, Search, Trash2, UserCheck, Users } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { FirstRun } from "@/components/first-run";
import { useReadOnly } from "@/components/current-user";
import { ExportButton } from "@/components/export-button";
import { FilterDisclosure } from "@/components/filter-disclosure";
import { AnimatedNumber } from "@/components/animated-number";
import { DeleteRecordDialog, PersonRecordDialog, PersonRecordValues } from "@/components/person-record-dialog";
import { toast } from "sonner";
import { NumberSkeleton, TableSkeleton } from "@/components/skeleton";
import { visiblePageNumbers } from "@/lib/pagination";

type Member = {
  id: string;
  initials: string;
  name: string;
  email: string;
  hasPhoto?: boolean;
  /** Só vem da ficha individual, nunca da listagem. */
  photoDataUrl?: string;
  ministry: string;
  ministryColor: "blue" | "green" | "gray" | "purple";
  status: "Ativo" | "Inativo";
  baptism: "Batizado" | "Aguardando";
  date: string;
  isNew?: boolean;
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
  role?: string;
  baptismDate?: string;
  notes?: string;
};

const pageSize = 6;

export default function MembersPage() {
  const readOnly = useReadOnly();

  /**
   * Abre a ficha buscando o registro COMPLETO.
   *
   * A listagem devolve só `hasPhoto` — a foto em si não vem, senão cem
   * cadastros virariam megabytes. Abrir o formulário com o objeto da lista
   * mostraria "sem foto" para quem tem uma, e quem salvasse depois de trocar
   * só o telefone poderia achar que a foto se perdeu.
   */
  async function openRecord(record: Member, mode: "view" | "edit") {
    setSelectedMember(record);
    setDialogMode(mode);
    try {
      const response = await fetch(`/api/members/${record.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const full = await response.json();
      setSelectedMember((current) => (current && current.id === record.id ? { ...current, ...full } : current));
    } catch {
      // Sem a ficha completa o formulário abre com o que a lista tem. O
      // servidor ignora chave ausente, então salvar não apaga a foto.
    }
  }
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [ministries, setMinistries] = useState<string[]>([]);
  const [counts, setCounts] = useState({ ativos: 0, batizados: 0, aguardando: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ministry, setMinistry] = useState("all");
  const [status, setStatus] = useState("all");
  const [baptism, setBaptism] = useState("all");
  const [page, setPage] = useState(1);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view" | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);

  /**
   * Filtro e paginação são do SERVIDOR. A lista em memória é uma PÁGINA, então
   * nada aqui pode ser contado a partir dela — foi por isso que os indicadores
   * passaram a vir de consultas de contagem, e não de `members.filter(...)`.
   */
  const listQuery = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) query.set("search", search.trim());
    if (ministry !== "all") query.set("ministry", ministry);
    if (status !== "all") query.set("status", status);
    if (baptism !== "all") query.set("baptism", baptism);
    return query.toString();
  }, [baptism, ministry, page, search, status]);

  const loadMembers = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/members?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao carregar membros");
      const payload = await response.json() as {
        records: Array<Omit<Member, "initials" | "status" | "baptism" | "date"> & { status: string; baptism: string; date: string }>;
        total: number;
      };
      setMembers(payload.records.map((member) => ({
        ...member,
        initials: initialsFrom(member.name),
        status: member.status === "active" ? "Ativo" : "Inativo",
        baptism: member.baptism === "baptized" ? "Batizado" : "Aguardando",
        date: formatDate(member.date),
      })));
      setTotal(payload.total);
    } catch {
      toast.error("Não foi possível carregar os membros");
    } finally {
      setLoading(false);
    }
  }, []);

  // A busca espera a digitação parar; os outros filtros valem na hora.
  useEffect(() => {
    const delay = search.trim() ? 300 : 0;
    const timer = window.setTimeout(() => void loadMembers(listQuery), delay);
    return () => window.clearTimeout(timer);
  }, [listQuery, loadMembers, search]);

  /**
   * Contagens dos indicadores. Cada uma é uma consulta que pede UMA linha e lê
   * o `total`, que já respeita o filtro — barato e exato, ao contrário de
   * somar a página.
   */
  useEffect(() => {
    let active = true;
    const count = async (filter: string) => {
      const response = await fetch(`/api/members?pageSize=1&${filter}`, { cache: "no-store" });
      if (!response.ok) return 0;
      return (await response.json()).total as number;
    };
    Promise.all([count("status=Ativo"), count("baptism=Batizado"), count("baptism=Aguardando")])
      .then(([ativos, batizados, aguardando]) => active && setCounts({ ativos, batizados, aguardando }))
      .catch(() => undefined);
    return () => { active = false; };
  }, [members]);

  // A lista de ministérios não pode sair da página: ela viria incompleta.
  useEffect(() => {
    let active = true;
    fetch("/api/ministries", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active || !payload) return;
        const list = (payload.ministries ?? payload) as Array<{ name: string }>;
        setMinistries(list.map((item) => item.name));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleMembers = members;
  const start = total ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, total);

  function updateFilter(action: () => void) {
    action();
    setPage(1);
  }

  const activeFilters = [ministry !== "all", status !== "all", baptism !== "all", search.trim() !== ""].filter(Boolean).length;

  /** Sem NENHUM membro e sem filtro: a tela vira primeira vez. */
  const firstRun = !loading && total === 0 && activeFilters === 0;

  function clearFilters() {
    setSearch("");
    setMinistry("all");
    setStatus("all");
    setBaptism("all");
    setPage(1);
  }

  async function saveMember(values: PersonRecordValues) {
    const editing = dialogMode === "edit" && selectedMember;
    const response = await fetch(editing ? `/api/members/${selectedMember.id}` : "/api/members", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      toast.error("Não foi possível salvar o membro");
      return false;
    }
    toast.success(editing ? "Membro alterado com sucesso" : "Membro cadastrado com sucesso");
    setDialogMode(null); setSelectedMember(null); setPage(1);
    await loadMembers(listQuery);
    return true;
  }

  async function confirmDelete() {
    if (!deleteTarget) return false;
    const response = await fetch(`/api/members/${deleteTarget.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Não foi possível excluir o membro");
      return false;
    }
    toast.error("Membro excluído com sucesso");
    setDeleteTarget(null);
    await loadMembers(listQuery);
    return true;
  }

  return (
    <DashboardShell title="Membros">
      <main className="members-main">
        <section className="members-heading">
          <div><h2>Gestão de Membros</h2><p>Visualize, filtre e gerencie todos os membros da congregação.</p></div>
          <ExportButton resource="members" permission="members.read" filters={{ search, ministry, status, baptism }} />
          <button disabled={readOnly} title={readOnly ? "A conta está em somente leitura por mensalidade em aberto. Regularize para voltar a cadastrar." : undefined} className="primary-action" onClick={() => { setSelectedMember(null); setDialogMode("create"); }}><Plus />Novo Membro</button>
        </section>

        {firstRun ? (
          <FirstRun
            action={
              readOnly ? undefined : (
                <button className="primary-action" onClick={() => { setSelectedMember(null); setDialogMode("create"); }} type="button">
                  <Plus />Cadastrar o primeiro membro
                </button>
              )
            }
            icon={Users}
            text="Cadastre quem já faz parte da igreja. Daqui em diante você encontra qualquer pessoa pelo nome, com a ficha inteira na mão."
            title="Nenhum membro cadastrado ainda"
          />
        ) : (
        <section className="members-content">
          <FilterDisclosure activeCount={activeFilters}>
            <div className="member-filters">
              <select aria-label="Filtrar por ministério" value={ministry} onChange={(event) => updateFilter(() => setMinistry(event.target.value))}>
                <option value="all">Todos os Ministérios</option>
                {ministries.map((item) => <option key={item}>{item}</option>)}
              </select>
              <select aria-label="Filtrar por status" value={status} onChange={(event) => updateFilter(() => setStatus(event.target.value))}>
                <option value="all">Status: Todos</option><option>Ativo</option><option>Inativo</option>
              </select>
              <select aria-label="Filtrar por batismo" value={baptism} onChange={(event) => updateFilter(() => setBaptism(event.target.value))}>
                <option value="all">Batismo: Todos</option><option>Batizado</option><option>Aguardando</option>
              </select>
              <label className="member-filter-search"><Search /><input value={search} onChange={(event) => updateFilter(() => setSearch(event.target.value))} placeholder="Filtrar por nome..." /></label>
              <button className="clear-filters" onClick={clearFilters}>Limpar Filtros</button>
            </div>
          </FilterDisclosure>

          <div className="members-table-card">
            <div className="members-table-scroll">
              <table className="members-table">
                <colgroup>
                  <col className="member-col-name" />
                  <col className="member-col-ministry" />
                  <col className="member-col-status" />
                  <col className="member-col-baptism" />
                  <col className="member-col-date" />
                  <col className="member-col-actions" />
                </colgroup>
                <thead><tr><th>Nome</th><th>Ministério</th><th>Status</th><th>Batismo</th><th>Data de Admissão</th><th>Ações</th></tr></thead>
                <tbody>
                  {visibleMembers.map((member) => (
                    <tr key={member.email}>
                      <td data-label="Nome"><div className="member-identity"><span className="member-avatar">{member.initials}</span><span><strong>{member.name}</strong><small>{member.email}</small></span></div></td>
                      <td data-label="Ministério"><span className={`ministry-tag ${member.ministryColor}`}>{member.ministry}</span></td>
                      <td data-label="Status"><span className={`status-tag ${member.status === "Ativo" ? "is-active" : "is-inactive"}`}><i />{member.status}</span></td>
                      <td data-label="Batismo"><span className={`baptism-tag ${member.baptism === "Batizado" ? "is-baptized" : "is-waiting"}`}>{member.baptism}</span></td>
                      <td data-label="Admissão" className="admission-date">{member.date}</td>
                      <td data-label="Ações"><div className="member-actions"><button aria-label={`Visualizar ${member.name}`} onClick={() => openRecord(member, "view")}><Eye /></button><button aria-label={`Editar ${member.name}`} onClick={() => openRecord(member, "edit")}><Pencil /></button><button aria-label={`Excluir ${member.name}`} onClick={() => setDeleteTarget(member)}><Trash2 /></button></div></td>
                    </tr>
                  ))}
                  {!loading && !visibleMembers.length && <tr><td className="members-empty" colSpan={6}>{members.length ? "Nenhum membro encontrado com esses filtros." : "Nenhum membro cadastrado ainda. Comece pelo botão Novo Membro, no topo da tela."}</td></tr>}
                </tbody>
              </table>
            </div>
            {loading && <TableSkeleton rows={6} columns={5} />}
            <div className="members-pagination">
              <span>Mostrando {start}-{end} de {total} membros</span>
              <div>
                <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Página anterior"><ChevronLeft /></button>
                {visiblePageNumbers(currentPage, pageCount).map((number) => <button className={number === currentPage ? "current" : undefined} onClick={() => setPage(number)} key={number}>{number}</button>)}
                <button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Próxima página"><ChevronRight /></button>
              </div>
            </div>
          </div>

          <section className="member-stats" aria-label="Resumo de membros">
            <MemberStat loading={loading} label="Total ativos" value={counts.ativos} icon={UserCheck} color="green" />
            {/* "Novos este mês" sairia da página, não do total: a API não tem
                filtro para "entrou este mês" e o número seria 25 de 137. Um
                indicador errado é pior que um indicador a menos — volta quando
                o backend expuser a contagem. */}
            <MemberStat loading={loading} label="Batizados" value={counts.batizados} icon={Droplets} color="neutral" />
            <MemberStat loading={loading} label="Aguardando batismo" value={counts.aguardando} icon={HeartHandshake} color="blue" />
          </section>
        </section>
        )}
      </main>
      <PersonRecordDialog open={dialogMode !== null} mode={dialogMode ?? "create"} kind="member" initialValues={selectedMember ? memberValues(selectedMember) : undefined} onClose={() => { setDialogMode(null); setSelectedMember(null); }} onSubmit={saveMember} />
      <DeleteRecordDialog open={deleteTarget !== null} name={deleteTarget?.name ?? ""} kind="member" onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    </DashboardShell>
  );
}

function initialsFrom(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)).replace(/\./g, "").replace(/\s+de\s+/g, " ");
}

function memberValues(member: Member): Partial<PersonRecordValues> {
  return { name: member.name, email: member.email, phone: member.phone, birthDate: member.birthDate?.slice(0, 10), gender: member.gender, civilStatus: member.civilStatus, cpf: member.cpf, zipCode: member.zipCode, address: member.address, neighborhood: member.neighborhood, city: member.city, state: member.state, role: member.role, ministry: member.ministry, baptismDate: member.baptismDate?.slice(0, 10), status: member.status, notes: member.notes, photoDataUrl: member.photoDataUrl };
}

function ministryColor(ministry: string): Member["ministryColor"] {
  if (ministry === "Louvor") return "blue";
  if (ministry === "Missões") return "green";
  if (ministry === "Nenhum") return "gray";
  return "purple";
}

function MemberStat({ label, value, prefix, icon: Icon, color, loading }: { label: string; value: number; prefix?: string; icon: typeof UserCheck; color: string; loading: boolean }) {
  return <article className="member-stat-card"><span className={`member-stat-icon ${color}`}><Icon /></span><span><small>{label}</small><strong>{loading ? <NumberSkeleton /> : <AnimatedNumber value={value} prefix={prefix} />}</strong></span></article>;
}
