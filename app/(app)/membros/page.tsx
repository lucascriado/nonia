"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Droplets,
  Eye,
  HeartHandshake,
  Landmark,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
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
  photoDataUrl?: string;
  ministry: string;
  ministryColor: "blue" | "green" | "gray" | "purple";
  cell: string;
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
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ministry, setMinistry] = useState("all");
  const [status, setStatus] = useState("all");
  const [baptism, setBaptism] = useState("all");
  const [page, setPage] = useState(1);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view" | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);

  async function loadMembers() {
    setLoading(true);
    try {
      const response = await fetch("/api/members", { cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao carregar membros");
      const records = await response.json() as Array<Omit<Member, "initials" | "status" | "baptism" | "date"> & { status: string; baptism: string; date: string }>;
      setMembers(records.map((member) => ({
        ...member,
        initials: initialsFrom(member.name),
        status: member.status === "active" ? "Ativo" : "Inativo",
        baptism: member.baptism === "baptized" ? "Batizado" : "Aguardando",
        date: formatDate(member.date),
      })));
    } catch {
      toast.error("Não foi possível carregar os membros");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadMembers(); }, []);

  const ministries = [...new Set(members.map((member) => member.ministry))];
  const filteredMembers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return members.filter((member) => {
      const matchesSearch = !term || `${member.name} ${member.email} ${member.cell}`.toLocaleLowerCase("pt-BR").includes(term);
      return matchesSearch
        && (ministry === "all" || member.ministry === ministry)
        && (status === "all" || member.status === status)
        && (baptism === "all" || member.baptism === baptism);
    });
  }, [baptism, members, ministry, search, status]);

  const pageCount = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleMembers = filteredMembers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const start = filteredMembers.length ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, filteredMembers.length);

  function updateFilter(action: () => void) {
    action();
    setPage(1);
  }

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
    await loadMembers();
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
    await loadMembers();
    return true;
  }

  return (
    <DashboardShell title="Membros">
      <main className="members-main">
        <section className="members-heading">
          <div><h2>Gestão de Membros</h2><p>Visualize, filtre e gerencie todos os membros da congregação.</p></div>
          <button className="primary-action" onClick={() => { setSelectedMember(null); setDialogMode("create"); }}><Plus />Novo Membro</button>
        </section>

        <section className="members-content">
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

          <div className="members-table-card">
            <div className="members-table-scroll">
              <table className="members-table">
                <colgroup>
                  <col className="member-col-name" />
                  <col className="member-col-ministry" />
                  <col className="member-col-cell" />
                  <col className="member-col-status" />
                  <col className="member-col-baptism" />
                  <col className="member-col-date" />
                  <col className="member-col-actions" />
                </colgroup>
                <thead><tr><th>Nome</th><th>Ministério</th><th>Células</th><th>Status</th><th>Batismo</th><th>Data de Admissão</th><th>Ações</th></tr></thead>
                <tbody>
                  {visibleMembers.map((member) => (
                    <tr key={member.email}>
                      <td data-label="Nome"><div className="member-identity"><span className="member-avatar">{member.photoDataUrl ? <img src={member.photoDataUrl} alt="" /> : member.initials}</span><span><strong>{member.name}</strong><small>{member.email}</small></span></div></td>
                      <td data-label="Ministério"><span className={`ministry-tag ${member.ministryColor}`}>{member.ministry}</span></td>
                      <td data-label="Célula"><span className={`cell-tag ${member.cell === "Sem célula" ? "empty" : ""}`}>{member.cell}</span></td>
                      <td data-label="Status"><span className={`status-tag ${member.status === "Ativo" ? "is-active" : "is-inactive"}`}><i />{member.status}</span></td>
                      <td data-label="Batismo"><span className={`baptism-tag ${member.baptism === "Batizado" ? "is-baptized" : "is-waiting"}`}>{member.baptism}</span></td>
                      <td data-label="Admissão" className="admission-date">{member.date}</td>
                      <td data-label="Ações"><div className="member-actions"><button aria-label={`Visualizar ${member.name}`} onClick={() => { setSelectedMember(member); setDialogMode("view"); }}><Eye /></button><button aria-label={`Editar ${member.name}`} onClick={() => { setSelectedMember(member); setDialogMode("edit"); }}><Pencil /></button><button aria-label={`Excluir ${member.name}`} onClick={() => setDeleteTarget(member)}><Trash2 /></button></div></td>
                    </tr>
                  ))}
                  {!loading && !visibleMembers.length && <tr><td className="members-empty" colSpan={7}>Nenhum membro encontrado com esses filtros.</td></tr>}
                </tbody>
              </table>
            </div>
            {loading && <TableSkeleton rows={6} columns={5} />}
            <div className="members-pagination">
              <span>Mostrando {start}-{end} de {filteredMembers.length} membros</span>
              <div>
                <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Página anterior"><ChevronLeft /></button>
                {visiblePageNumbers(currentPage, pageCount).map((number) => <button className={number === currentPage ? "current" : undefined} onClick={() => setPage(number)} key={number}>{number}</button>)}
                <button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Próxima página"><ChevronRight /></button>
              </div>
            </div>
          </div>

          <section className="member-stats" aria-label="Resumo de membros">
            <MemberStat loading={loading} label="Total ativos" value={members.filter((member) => member.status === "Ativo").length} icon={UserCheck} color="green" />
            <MemberStat loading={loading} label="Novos este mês" value={members.filter((member) => member.isNew).length} prefix="+" icon={Landmark} color="blue" />
            <MemberStat loading={loading} label="Batizados" value={members.filter((member) => member.baptism === "Batizado").length} icon={Droplets} color="neutral" />
            <MemberStat loading={loading} label="Aguardando batismo" value={members.filter((member) => member.baptism === "Aguardando").length} icon={HeartHandshake} color="blue" />
          </section>
        </section>
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
  return { name: member.name, email: member.email, phone: member.phone, birthDate: member.birthDate?.slice(0, 10), gender: member.gender, civilStatus: member.civilStatus, cpf: member.cpf, zipCode: member.zipCode, address: member.address, neighborhood: member.neighborhood, city: member.city, state: member.state, role: member.role, ministry: member.ministry, cell: member.cell, baptismDate: member.baptismDate?.slice(0, 10), status: member.status, notes: member.notes, photoDataUrl: member.photoDataUrl };
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
