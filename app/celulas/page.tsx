"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock, Edit3, Eye, LoaderCircle, MapPin, Network, Plus, Search, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard-shell";
import { NumberSkeleton, Skeleton } from "@/components/skeleton";
import { AnimatedNumber } from "@/components/animated-number";
import { DeleteRecordDialog } from "@/components/person-record-dialog";

type MemberOption = { id: string; name: string; email: string; cell?: string };
type Cell = {
  id: string;
  name: string;
  address: string | null;
  meetingDay: string;
  meetingTime: string;
  color: "blue" | "green" | "gray" | "purple";
  notes: string | null;
  leaderId: string | null;
  leaderName: string | null;
  memberCount: number;
  members: MemberOption[];
};

type CellFormValues = {
  name: string;
  address: string;
  meetingDay: string;
  meetingTime: string;
  color: "blue" | "green" | "gray" | "purple";
  leaderId: string;
  notes: string;
  memberIds: string[];
};

const emptyCell: CellFormValues = {
  name: "",
  address: "",
  meetingDay: "Domingo",
  meetingTime: "19:30",
  color: "purple",
  leaderId: "",
  notes: "",
  memberIds: [],
};

export default function CellsPage() {
  const [cells, setCells] = useState<Cell[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [meetingDay, setMeetingDay] = useState("all");
  const [leader, setLeader] = useState("all");
  const [mode, setMode] = useState<"create" | "edit" | "view" | null>(null);
  const [selectedCell, setSelectedCell] = useState<Cell | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Cell | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [cellsResponse, membersResponse] = await Promise.all([
        fetch("/api/cells", { cache: "no-store" }),
        fetch("/api/members", { cache: "no-store" }),
      ]);
      if (!cellsResponse.ok || !membersResponse.ok) throw new Error("Falha ao carregar células");
      setCells(await cellsResponse.json());
      const memberRows = await membersResponse.json() as Array<MemberOption>;
      setMembers(memberRows.map((member) => ({ id: member.id, name: member.name, email: member.email, cell: member.cell })));
    } catch {
      toast.error("Não foi possível carregar células");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  const leaders = useMemo(() => [...new Set(cells.map((cell) => cell.leaderName).filter(Boolean))] as string[], [cells]);
  const meetingDays = useMemo(() => [...new Set(cells.map((cell) => cell.meetingDay).filter(Boolean))], [cells]);
  const filteredCells = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return cells.filter((cell) => {
      const matchesSearch = !term || `${cell.name} ${cell.address ?? ""} ${cell.leaderName ?? ""}`.toLocaleLowerCase("pt-BR").includes(term);
      return matchesSearch
        && (meetingDay === "all" || cell.meetingDay === meetingDay)
        && (leader === "all" || cell.leaderName === leader);
    });
  }, [cells, leader, meetingDay, search]);

  const assignedMembers = useMemo(() => cells.reduce((total, cell) => total + cell.memberCount, 0), [cells]);
  const average = cells.length ? Math.round(assignedMembers / cells.length) : 0;

  function clearFilters() {
    setSearch("");
    setMeetingDay("all");
    setLeader("all");
  }

  async function saveCell(values: CellFormValues) {
    const editing = mode === "edit" && selectedCell;
    const response = await fetch(editing ? `/api/cells/${selectedCell.id}` : "/api/cells", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      toast.error("Não foi possível salvar a célula");
      return false;
    }
    toast.success(editing ? "Célula atualizada com sucesso" : "Célula criada com sucesso");
    closeForm();
    await loadData();
    return true;
  }

  async function confirmDeleteCell() {
    if (!deleteTarget) return false;
    const response = await fetch(`/api/cells/${deleteTarget.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Não foi possível excluir a célula");
      return false;
    }
    toast.success("Célula excluída");
    setDeleteTarget(null);
    await loadData();
    return true;
  }

  function openForm(nextMode: "create" | "edit" | "view", cell: Cell | null = null) {
    setSelectedCell(cell);
    setMode(nextMode);
  }

  function closeForm() {
    setMode(null);
    setSelectedCell(null);
  }

  return (
    <DashboardShell title="Gestão de Células">
      <main className="cells-main">
        <section className="resource-heading">
          <div>
            <h2>Gestão de Células</h2>
            <p>Gerencie e acompanhe o crescimento dos pequenos grupos.</p>
          </div>
          {!mode && <button className="primary-action" onClick={() => openForm("create")}><Plus />Nova Célula</button>}
        </section>

        {mode ? (
          <CellForm mode={mode} cell={selectedCell} members={members} onClose={closeForm} onSubmit={saveCell} />
        ) : (
          <>
            <section className="resource-stats cells-summary">
              <article><span><Network /></span><small>Total de células</small><strong>{loading ? <NumberSkeleton /> : <AnimatedNumber value={cells.length} />}</strong></article>
              <article><span><Users /></span><small>Membros vinculados</small><strong>{loading ? <NumberSkeleton /> : <AnimatedNumber value={assignedMembers} />}</strong></article>
              <article><span><CalendarClock /></span><small>Média por célula</small><strong>{loading ? <NumberSkeleton /> : <AnimatedNumber value={average} />}</strong></article>
              <article><span><MapPin /></span><small>Com endereço</small><strong>{loading ? <NumberSkeleton /> : <AnimatedNumber value={cells.filter((cell) => cell.address).length} />}</strong></article>
            </section>

            <div className="member-filters resource-filters">
              <select aria-label="Filtrar por dia" value={meetingDay} onChange={(event) => setMeetingDay(event.target.value)}>
                <option value="all">Dia: Todos</option>
                {meetingDays.map((day) => <option key={day}>{day}</option>)}
              </select>
              <select aria-label="Filtrar por líder" value={leader} onChange={(event) => setLeader(event.target.value)}>
                <option value="all">Líder: Todos</option>
                {leaders.map((item) => <option key={item}>{item}</option>)}
              </select>
              <label className="member-filter-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrar célula..." /></label>
              <button className="clear-filters" onClick={clearFilters}>Limpar Filtros</button>
            </div>

            <section className="cell-grid">
              {loading && Array.from({ length: 4 }).map((_, index) => <ResourceCardSkeleton key={index} />)}
              {!loading && filteredCells.map((cell, index) => (
                <article className={`resource-card cell-card tone-${cell.color}`} key={cell.id}>
                  <header>
                    <span className="resource-icon">{cellIcon(index)}</span>
                    <em>{cell.memberCount.toString().padStart(2, "0")} pessoas</em>
                  </header>
                  <h3>{cell.name}</h3>
                  <p><MapPin />{cell.address || "Endereço não informado"}</p>
                  <p><Clock />{cell.meetingDay}, {cell.meetingTime}</p>
                  <div className="avatar-row">{cell.members.slice(0, 3).map((member) => <span key={member.id}>{initials(member.name)}</span>)}{cell.memberCount > 3 && <span>+{cell.memberCount - 3}</span>}</div>
                  <footer>
                    <button onClick={() => openForm("view", cell)}><Eye />Visualizar</button>
                    <button onClick={() => openForm("edit", cell)}><Edit3 />Editar</button>
                    <button className="danger" onClick={() => setDeleteTarget(cell)}><Trash2 />Excluir</button>
                  </footer>
                </article>
              ))}
              {!loading && !filteredCells.length && <p className="data-empty">Nenhuma célula encontrada.</p>}
            </section>

          </>
        )}
      </main>
      <DeleteRecordDialog open={deleteTarget !== null} name={deleteTarget?.name ?? ""} kind="cell" onClose={() => setDeleteTarget(null)} onConfirm={confirmDeleteCell} />
    </DashboardShell>
  );
}

function CellForm({ mode, cell, members, onClose, onSubmit }: { mode: "create" | "edit" | "view"; cell: Cell | null; members: MemberOption[]; onClose: () => void; onSubmit: (values: CellFormValues) => Promise<boolean> }) {
  const [values, setValues] = useState<CellFormValues>(emptyCell);
  const [memberSearch, setMemberSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const readOnly = mode === "view";
  const filteredMembers = useMemo(() => {
    const term = memberSearch.trim().toLocaleLowerCase("pt-BR");
    return members
      .filter((member) => !term || `${member.name} ${member.email}`.toLocaleLowerCase("pt-BR").includes(term))
      .sort((a, b) => {
        const aSelected = values.memberIds.includes(a.id);
        const bSelected = values.memberIds.includes(b.id);
        if (aSelected !== bSelected) return aSelected ? -1 : 1;
        return a.name.localeCompare(b.name, "pt-BR");
      });
  }, [memberSearch, members, values.memberIds]);

  useEffect(() => {
    setSaving(false);
    setMemberSearch("");
    setValues(cell ? {
      name: cell.name,
      address: cell.address ?? "",
      meetingDay: cell.meetingDay,
      meetingTime: cell.meetingTime,
      color: cell.color,
      leaderId: cell.leaderId ?? "",
      notes: cell.notes ?? "",
      memberIds: cell.members.map((member) => member.id),
    } : emptyCell);
  }, [cell]);

  function update(field: keyof CellFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function toggleMember(memberId: string) {
    setValues((current) => ({
      ...current,
      memberIds: current.memberIds.includes(memberId)
        ? current.memberIds.filter((id) => id !== memberId)
        : [...current.memberIds, memberId],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || readOnly) return;
    setSaving(true);
    try {
      await onSubmit(values);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="resource-dialog resource-page-form cell-resource-dialog" onSubmit={submit}>
      <header>
        <div><strong>{mode === "create" ? "Nova Célula" : mode === "view" ? "Detalhes da Célula" : "Editar Célula"}</strong><span>Vincule membros já cadastrados ao pequeno grupo.</span></div>
        <button type="button" onClick={onClose} aria-label="Fechar"><X /></button>
      </header>
      <fieldset disabled={saving}>
        <label><span>Nome *</span><input required readOnly={readOnly} value={values.name} onChange={(event) => update("name", event.target.value)} /></label>
        <label><span>Líder</span><select disabled={readOnly} value={values.leaderId} onChange={(event) => update("leaderId", event.target.value)}><option value="">Sem líder definido</option>{members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
        <label><span>Endereço</span><input readOnly={readOnly} value={values.address} onChange={(event) => update("address", event.target.value)} /></label>
        <label><span>Dia</span><select disabled={readOnly} value={values.meetingDay} onChange={(event) => update("meetingDay", event.target.value)}>{["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"].map((day) => <option key={day}>{day}</option>)}</select></label>
        <label><span>Horário</span><input type="time" readOnly={readOnly} value={values.meetingTime} onChange={(event) => update("meetingTime", event.target.value)} /></label>
        <label><span>Cor</span><select disabled={readOnly} value={values.color} onChange={(event) => update("color", event.target.value)}><option value="purple">Roxo</option><option value="blue">Azul</option><option value="green">Verde</option><option value="gray">Cinza</option></select></label>
        <label className="wide form-section-field"><span>Observações</span><textarea readOnly={readOnly} value={values.notes} onChange={(event) => update("notes", event.target.value)} /></label>
        <div className="member-picker wide">
          <span>Membros da célula</span>
          <small className="member-picker-help">Marque abaixo as pessoas que pertencem a esta célula.</small>
          <label className="member-filter-search member-picker-filter"><Search /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Filtrar membros..." /></label>
          <div>{filteredMembers.map((member) => {
            const selected = values.memberIds.includes(member.id);
            return (
              <label className={selected ? "selected" : undefined} key={member.id}>
                <input type="checkbox" disabled={readOnly} checked={selected} onChange={() => toggleMember(member.id)} />
                <strong>{member.name}</strong>
                <small>{member.email}</small>
                <small className="member-picker-meta">{selected ? "Vinculado nesta célula" : member.cell && member.cell !== "Sem célula" ? `Atual: ${member.cell}` : "Sem célula"}</small>
              </label>
            );
          })}</div>
          {!filteredMembers.length && <small className="member-picker-empty">Nenhum membro encontrado.</small>}
        </div>
      </fieldset>
      {!readOnly && <footer><button type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-action" disabled={saving}>{saving ? <LoaderCircle className="button-spinner" /> : <Plus />}{saving ? "Salvando..." : "Salvar Célula"}</button></footer>}
    </form>
  );
}

function ResourceCardSkeleton() {
  return (
    <article className="resource-card resource-loading-card">
      <div className="resource-loading-top"><Skeleton className="resource-loading-icon" /><Skeleton className="resource-loading-pill" /></div>
      <Skeleton className="resource-loading-title" />
      <Skeleton className="resource-loading-text" />
      <Skeleton className="resource-loading-text short" />
      <div className="resource-loading-actions"><Skeleton /><Skeleton /><Skeleton /></div>
    </article>
  );
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function cellIcon(index: number) {
  const icons = [<Network key="network" />, <Users key="users" />, <MapPin key="map" />, <CalendarClock key="calendar" />];
  return icons[index % icons.length];
}
