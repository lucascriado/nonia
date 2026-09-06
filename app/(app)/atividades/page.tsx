"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, History, ListChecks, Settings, UserPlus, Users } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { FirstRun } from "@/components/first-run";
import { FilterDisclosure } from "@/components/filter-disclosure";
import { toast } from "sonner";
import { ActivitySkeleton } from "@/components/skeleton";
import { visiblePageNumbers } from "@/lib/pagination";

type Activity = { id: string; category: "members" | "visitors" | "calendar" | "system"; actor: string; action: string; subject?: string; details?: string; occurredAt: string };
const categories = [{ value: "all", label: "Todos" }, { value: "members", label: "Membros" }, { value: "visitors", label: "Visitantes" }, { value: "calendar", label: "Calendário" }, { value: "system", label: "Sistema" }];
const pageSize = 6;

export default function ActivitiesPage() {
  const [records, setRecords] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [date, setDate] = useState("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize), date, category, search });
    setLoading(true);
    fetch(`/api/activities?${params}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()).then((data) => { setRecords(data.records); setTotal(data.total); }).catch(() => toast.error("Não foi possível carregar as atividades")).finally(() => setLoading(false));
  }, [category, date, page, search]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const activeFilters = [search.trim() !== "", date !== "all", category !== "all"].filter(Boolean).length;

  /** Igreja sem nenhuma atividade e sem filtro: nada a listar nem a filtrar. */
  const firstRun = !loading && total === 0 && activeFilters === 0;

  return (
    <DashboardShell title="Atividades">
      <main className="activities-main">
        <section className="activities-heading"><h2>Atividades Recentes</h2><p>Tudo o que mudou na igreja: quem alterou, o que alterou e quando.</p></section>
        {firstRun ? (
          <FirstRun
            icon={History}
            text="Cada cadastro, alteração e exclusão vira um registro aqui, com autor e data. A lista começa a se preencher assim que a igreja for usada."
            title="Nenhuma atividade registrada ainda"
          />
        ) : (
        <section className="activities-content">
        <FilterDisclosure activeCount={activeFilters}>
          <section className="activities-filters">
            <label><span>Busca</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Pesquisar atividades..." /></label>
            <label><span>Data</span><select value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }}><option value="all">Todo período</option><option value="today">Hoje</option><option value="week">Últimos 7 dias</option><option value="month">Últimos 30 dias</option></select></label>
            <div><span>Categorias</span><nav>{categories.map((item) => <button className={category === item.value ? "active" : undefined} key={item.value} onClick={() => { setCategory(item.value); setPage(1); }}>{item.label}</button>)}</nav></div>
          </section>
        </FilterDisclosure>
        <section className="activity-timeline-card">
          <div className="activity-timeline">
            {loading && <ActivitySkeleton count={pageSize} />}
            {!loading && records.map((activity, index) => <ActivityItem activity={activity} key={activity.id} showLine={index < records.length - 1} />)}
            {!loading && !records.length && !firstRun && <p className="data-empty">Nenhuma atividade encontrada com esses filtros.</p>}
          </div>
          {/* Com uma página só, seta e número não levam a lugar nenhum: fica a
              contagem, que ainda informa. */}
          {!firstRun && (
            <footer className="activity-pagination">
              <span>Mostrando {records.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, total)} de {total} atividades</span>
              {pageCount > 1 && (
                <div><button disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft /></button>{visiblePageNumbers(page, pageCount).map((number) => <button className={number === page ? "current" : undefined} key={number} onClick={() => setPage(number)}>{number}</button>)}<button disabled={page === pageCount} onClick={() => setPage(page + 1)}><ChevronRight /></button></div>
              )}
            </footer>
          )}
        </section>
        </section>
        )}
      </main>
    </DashboardShell>
  );
}

function ActivityItem({ activity, showLine }: { activity: Activity; showLine: boolean }) {
  const config = activity.category === "members" ? { icon: Users, label: "Membros" } : activity.category === "visitors" ? { icon: UserPlus, label: "Visitantes" } : activity.category === "calendar" ? { icon: CalendarDays, label: "Calendário" } : { icon: Settings, label: "Sistema" };
  const Icon = config.icon;
  return <article className={`timeline-item category-${activity.category}`}><div className="timeline-marker"><span><Icon /></span>{showLine && <i />}</div><div className="timeline-content"><div><p><strong>{activity.actor}</strong> {activity.action} {activity.subject && <b>{activity.subject}</b>}</p><small>{activity.details}</small><em>{config.label}</em></div><time>{formatActivityDate(activity.occurredAt)}</time></div></article>;
}

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)).replace(".", "");
}
