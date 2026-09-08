"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Plus, Trash2, Users, X } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { READ_ONLY_REASON, usePermission, useReadOnly, useSession } from "@/components/current-user";
import { hojeNoFuso } from "@/lib/datas";
import { toast } from "sonner";
import { DeleteRecordDialog } from "@/components/person-record-dialog";
import { MinistryPeoplePicker, type PickerPerson } from "@/components/ministry-people-picker";

type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  location: string;
  startsAt: string;
  endsAt?: string | null;
  category: string;
  color: "purple" | "green" | "blue";
  /** Quem realizou/realiza o evento. Vem JUNTO do GET /api/events (o mês inteiro
   *  numa requisição só); array vazio quando não há. É PESSOA, não ficha de
   *  membro -- a ficha some sem a pessoa sumir, e o evento não perde quem o fez. */
  responsibles?: { id: string; name: string }[];
};

type EventFormValues = {
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  color: CalendarEvent["color"];
  /** Ids de PESSOA. Vão no POST como `responsibleIds`. */
  responsibleIds: string[];
};

type CalendarView = "month" | "week" | "day";

const weekdays = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const categoryOptions = [
  { label: "Cultos", color: "blue" },
  { label: "Ministérios", color: "purple" },
  { label: "Ações Sociais", color: "green" },
] as const;

const emptyForm: EventFormValues = { title: "", description: "", location: "", date: "", time: "", color: "purple", responsibleIds: [] };

export default function CalendarPage() {
  const readOnly = useReadOnly();
  const canWrite = usePermission("events.write");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleDate, setVisibleDate] = useState(() => new Date());
  const [monthTransition, setMonthTransition] = useState<"next" | "previous" | "today">("today");
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [creating, setCreating] = useState(false);
  /** A data que o "Novo Evento" abre já preenchida. "" = aberto pelo botão, sem
   *  dia escolhido -- aí o formulário cai no hojeNoFuso. Ver EventFormModal. */
  const [createDate, setCreateDate] = useState("");

  function openCreate(date: string) {
    setCreateDate(date);
    setCreating(true);
  }
  const [enabledColors, setEnabledColors] = useState<Record<CalendarEvent["color"], boolean>>({ purple: true, green: true, blue: true });

  async function loadEvents() {
    setLoading(true);
    try {
      const response = await fetch("/api/events", { cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao carregar eventos");
      setEvents(await response.json());
    } catch {
      toast.error("Não foi possível carregar os eventos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadEvents(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("event");
    if (eventId) setSelectedEventId(eventId);
  }, []);

  const year = visibleDate.getFullYear();
  const month = visibleDate.getMonth();
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  const filteredEvents = events.filter((event) => enabledColors[event.color]);
  const upcomingEvents = filteredEvents.filter((event) => new Date(event.startsAt) >= startOfToday()).slice(0, 4);
  const weekDays = useMemo(() => {
    const start = startOfWeek(visibleDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { date, events: filteredEvents.filter((event) => sameDay(new Date(event.startsAt), date)) };
    });
  }, [filteredEvents, visibleDate]);
  const dayEvents = filteredEvents.filter((event) => sameDay(new Date(event.startsAt), visibleDate));

  function selectDay(date: Date) {
    setVisibleDate(date);
    if (window.matchMedia("(max-width: 640px)").matches) setCalendarView("day");
  }

  const days = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const previousMonthDays = new Date(year, month, 0).getDate();

    return Array.from({ length: 35 }, (_, index) => {
      const dayNumber = index - firstWeekday + 1;
      const date = new Date(year, month, dayNumber);
      const outside = dayNumber < 1 || dayNumber > daysInMonth;
      const number = dayNumber < 1 ? previousMonthDays + dayNumber : dayNumber > daysInMonth ? dayNumber - daysInMonth : dayNumber;
      const dayEvents = outside ? [] : filteredEvents.filter((event) => sameDay(new Date(event.startsAt), date));
      return { key: `${date.toISOString()}-${index}`, number, outside, date, events: dayEvents };
    });
  }, [filteredEvents, month, year]);

  function openEvent(id: string) {
    setSelectedEventId(id);
    window.history.pushState(null, "", `/calendario?event=${id}`);
  }

  function closeEvent() {
    setSelectedEventId(null);
    window.history.pushState(null, "", "/calendario");
  }

  function changeMonth(nextDate: Date, transition: "next" | "previous" | "today") {
    setMonthTransition(transition);
    setVisibleDate(nextDate);
  }

  async function createEvent(values: EventFormValues) {
    const startsAt = `${values.date}T${values.time || "19:00"}`;
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: values.title, description: values.description, location: values.location, startsAt, color: values.color, responsibleIds: values.responsibleIds }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null;
      toast.error(data?.error ?? "Não foi possível criar o evento");
      return false;
    }

    toast.success("Evento criado com sucesso");
    setCreating(false);
    await loadEvents();
    return true;
  }

  async function confirmDeleteEvent() {
    if (!deleteTarget) return false;
    const response = await fetch(`/api/events?id=${deleteTarget.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Não foi possível excluir o evento");
      return false;
    }
    toast.success("Evento excluído");
    setDeleteTarget(null);
    closeEvent();
    await loadEvents();
    return true;
  }

  return (
    <DashboardShell title="Calendário">
      <main className="calendar-main">
        <section className="calendar-layout">
          <div className="calendar-workspace">
            <header className="calendar-page-toolbar">
              <div className="calendar-page-title">
                <strong key={`${year}-${month}`}>{monthLabel(visibleDate)}</strong>
                <span className="calendar-nav-buttons">
                  <button aria-label="Mês anterior" onClick={() => changeMonth(new Date(year, month - 1, 1), "previous")}><ChevronLeft /></button>
                  <button aria-label="Próximo mês" onClick={() => changeMonth(new Date(year, month + 1, 1), "next")}><ChevronRight /></button>
                </span>
                <button className="calendar-today-button" onClick={() => changeMonth(new Date(), "today")}>Hoje</button>
              </div>
              <div className="calendar-page-actions">
                <div className="calendar-view-toggle" aria-label="Visualização do calendário">
                  <button className={calendarView === "month" ? "active" : undefined} onClick={() => setCalendarView("month")}>Mês</button>
                  <button className={calendarView === "week" ? "active" : undefined} onClick={() => setCalendarView("week")}>Semana</button>
                  <button className={calendarView === "day" ? "active" : undefined} onClick={() => setCalendarView("day")}>Dia</button>
                </div>
                {canWrite && <button className="primary-action calendar-new-event" disabled={readOnly} title={readOnly ? READ_ONLY_REASON : undefined} onClick={() => openCreate("")}><Plus />Novo Evento</button>}
              </div>
            </header>

            {calendarView === "month" && (
              <div className={`calendar-month-grid month-transition-${monthTransition}`} aria-busy={loading} key={`month-${year}-${month}`}>
                {weekdays.map((weekday) => <div className="calendar-weekday" key={weekday}>{weekday}</div>)}
                {days.map((day) => (
                  <div className={`calendar-day-cell ${day.outside ? "outside" : ""} ${sameDay(day.date, visibleDate) ? "is-selected" : ""}`} key={day.key}>
                    {/* No celular a célula tem ~45px e nenhum título cabe nela:
                        o dia vira o alvo de toque, com pontos indicando que há
                        evento, e a agenda do dia mostra os títulos por extenso. */}
                    <button className="calendar-day-select" onClick={() => { selectDay(day.date); if (canWrite && !readOnly) openCreate(dataDoDia(day.date)); }}>
                      <span className="calendar-day-number">{day.number}</span>
                      <span className="calendar-day-dots" aria-hidden>
                        {day.events.slice(0, 3).map((event) => <i className={event.color} key={event.id} />)}
                      </span>
                      <span className="mk-visually-hidden">
                        {day.events.length
                          ? `Dia ${day.number}, ${day.events.length} evento${day.events.length > 1 ? "s" : ""}`
                          : `Dia ${day.number}, sem eventos`}
                      </span>
                    </button>
                    {day.events.slice(0, 3).map((event) => (
                      <button className={`calendar-event-pill ${event.color}`} key={event.id} onClick={() => openEvent(event.id)}>
                        {event.title}
                      </button>
                    ))}
                    {day.events.length > 3 && <small>+{day.events.length - 3} eventos</small>}
                  </div>
                ))}
              </div>
            )}

            {calendarView === "week" && (
              <div className={`calendar-week-view month-transition-${monthTransition}`} key={`week-${visibleDate.toISOString()}`}>
                {weekDays.map((day) => (
                  <section className="calendar-week-column" key={day.date.toISOString()}>
                    <header><small>{weekdays[day.date.getDay()]}</small><strong>{day.date.getDate()}</strong></header>
                    <div>
                      {day.events.map((event) => <button className={`calendar-event-pill ${event.color}`} key={event.id} onClick={() => openEvent(event.id)}>{timeLabel(event.startsAt)} · {event.title}</button>)}
                      {!day.events.length && <span className="calendar-empty-slot">Sem eventos</span>}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {calendarView === "day" && (
              <div className={`calendar-day-view month-transition-${monthTransition}`} key={`day-${visibleDate.toISOString()}`}>
                <header><small>{monthShort(visibleDate)}</small><strong>{visibleDate.getDate()}</strong><span>{new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(visibleDate)}</span></header>
                <div>
                  {dayEvents.map((event) => <button className={`calendar-day-event ${event.color}`} key={event.id} onClick={() => openEvent(event.id)}><strong>{event.title}</strong><small><Clock /> {timeLabel(event.startsAt)} - {event.location}</small></button>)}
                  {!dayEvents.length && <p className="data-empty">Nenhum evento para este dia.</p>}
                </div>
              </div>
            )}
          </div>

          <aside className="calendar-side-panel">
            <section>
              <h2>Categorias</h2>
              <div className="calendar-categories">
                {categoryOptions.map((option) => (
                  <label key={option.color}>
                    <input checked={enabledColors[option.color]} onChange={(event) => setEnabledColors((current) => ({ ...current, [option.color]: event.target.checked }))} type="checkbox" />
                    <i className={option.color} />
                    {option.label}
                  </label>
                ))}
              </div>
            </section>
            <section className="calendar-side-summary">
              <span><CalendarDays />Próximos 30 dias</span>
              <strong>{eventsInNextDays(filteredEvents, 30)}</strong>
              <small>Eventos agendados</small>
            </section>
            <section>
              <h2>Próximos Eventos</h2>
              <div className="calendar-upcoming-list">
                {upcomingEvents.map((event) => <EventPreview event={event} key={event.id} onClick={() => openEvent(event.id)} />)}
                {!loading && !upcomingEvents.length && <p className="data-empty">Nenhum evento próximo.</p>}
              </div>
            </section>
          </aside>
        </section>
      </main>
      {selectedEvent && <EventDetailsModal canDelete={canWrite && !readOnly} event={selectedEvent} onClose={closeEvent} onDelete={() => setDeleteTarget(selectedEvent)} />}
      {creating && <EventFormModal initialDate={createDate} onClose={() => setCreating(false)} onSubmit={createEvent} />}
      <DeleteRecordDialog open={deleteTarget !== null} name={deleteTarget?.title ?? ""} kind="event" onClose={() => setDeleteTarget(null)} onConfirm={confirmDeleteEvent} />
    </DashboardShell>
  );
}

function EventPreview({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const date = new Date(event.startsAt);
  return (
    <button className="calendar-event-preview" onClick={onClick}>
      <span><small>{monthShort(date)}</small><strong>{date.getDate()}</strong></span>
      <div><strong>{event.title}</strong><small><Clock /> {timeLabel(event.startsAt)} - {event.location}</small></div>
    </button>
  );
}

function EventDetailsModal({ canDelete, event, onClose, onDelete }: { canDelete: boolean; event: CalendarEvent; onClose: () => void; onDelete: () => void }) {
  return (
    <div className="event-modal-layer" role="dialog" aria-modal="true" aria-label={`Evento ${event.title}`}>
      <section className="event-modal">
        <header>
          <span className={`event-modal-icon ${event.color}`}><CalendarDays /></span>
          <div><h2>{event.title}</h2><p>{fullDateLabel(event.startsAt)}</p></div>
          <button onClick={onClose} aria-label="Fechar evento"><X /></button>
        </header>
        <div className="event-modal-body">
          <p><MapPin />{event.location}</p>
          <p><Clock />{timeLabel(event.startsAt)}{event.endsAt ? ` - ${timeLabel(event.endsAt)}` : ""}</p>
          {event.responsibles && event.responsibles.length > 0 && (
            <p className="event-responsaveis-lista"><Users />{event.responsibles.map((r) => r.name).join(", ")}</p>
          )}
          {event.description && <article>{event.description}</article>}
        </div>
        {canDelete && <footer className="event-form-actions"><button className="event-delete-button" onClick={onDelete}><Trash2 />Excluir Evento</button></footer>}
      </section>
    </div>
  );
}

function EventFormModal({ initialDate, onClose, onSubmit }: { initialDate: string; onClose: () => void; onSubmit: (values: EventFormValues) => Promise<boolean> }) {
  /**
   * A DATA SUGERIDA SAI DO FUSO DA IGREJA, não de `toISOString()`.
   *
   * Era UTC, e em Brasília das 21h à meia-noite isso sugere AMANHÃ: quem abre
   * "Novo Evento" às 21h30 de domingo agenda para segunda sem perceber. Num
   * calendário o erro é pior que no financeiro, porque a data É o conteúdo --
   * ninguém confere a data de um evento contra outra fonte.
   *
   * Agora a tela ABRE a partir de um DIA CLICADO: a data dele chega em
   * `initialDate` e vence esta sugestão. O `hojeNoFuso` fica para o caso "abriu
   * pelo botão, sem dia escolhido" (`initialDate` vazio).
   */
  const { organization } = useSession();
  const [values, setValues] = useState<EventFormValues>(() => ({ ...emptyForm, date: initialDate || hojeNoFuso(organization?.timezone) }));
  const [submitting, setSubmitting] = useState(false);
  /**
   * As pessoas que o seletor oferece. O que se GRAVA é a PESSOA (people), não a
   * ficha de membro -- ficha some sem a pessoa sumir, e o evento não perde quem
   * o realizou. Oferecer os membros no seletor é só o filtro de quem aparece:
   * `member.id` já é o id da pessoa (é o que o backend resolve em `people`).
   * Carregado só aqui, quando o formulário abre, não na tela do calendário.
   */
  const [pessoas, setPessoas] = useState<PickerPerson[]>([]);
  useEffect(() => {
    let vivo = true;
    fetch("/api/members?pageSize=100", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { records: { id: string; name: string; email: string }[] }) => {
        if (vivo) setPessoas(data.records.map((m) => ({ id: m.id, name: m.name, email: m.email })));
      })
      .catch(() => undefined);
    return () => { vivo = false; };
  }, []);

  function alternarResponsavel(id: string) {
    setValues((atual) => atual.responsibleIds.includes(id)
      ? { ...atual, responsibleIds: atual.responsibleIds.filter((x) => x !== id) }
      : { ...atual, responsibleIds: [...atual.responsibleIds, id] });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="event-modal-layer" role="dialog" aria-modal="true" aria-label="Novo evento">
      <form className="event-modal event-form-modal" onSubmit={submit}>
        <header>
          <span className="event-modal-icon purple"><Plus /></span>
          <div><h2>Novo Evento</h2><p>Cadastre um item na agenda da igreja.</p></div>
          <button type="button" onClick={onClose} aria-label="Fechar evento"><X /></button>
        </header>
        <div className="event-form-grid">
          <label className="record-field wide"><span>Título *</span><input required value={values.title} onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))} /></label>
          <label className="record-field"><span>Data *</span><input required type="date" value={values.date} onChange={(event) => setValues((current) => ({ ...current, date: event.target.value }))} /></label>
          <label className="record-field"><span>Horário *</span><input required type="time" value={values.time} onChange={(event) => setValues((current) => ({ ...current, time: event.target.value }))} /></label>
          <label className="record-field"><span>Local *</span><input required value={values.location} onChange={(event) => setValues((current) => ({ ...current, location: event.target.value }))} /></label>
          <label className="record-field"><span>Cor</span><select value={values.color} onChange={(event) => setValues((current) => ({ ...current, color: event.target.value as CalendarEvent["color"] }))}><option value="purple">Roxo</option><option value="green">Verde</option><option value="blue">Azul</option></select></label>
          <label className="record-field wide"><span>Descrição</span><textarea value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} /></label>
          {/* Responsáveis: o MESMO seletor de pessoas do ministério, em modo de
              várias. Sem `ministryId`, o cinza de "compromisso" fica dormente --
              aqui não há esse conceito, só achar gente por busca. */}
          <div className="record-field wide event-responsaveis">
            <span>Responsáveis <em>(opcional)</em></span>
            <MinistryPeoplePicker
              people={pessoas}
              mode="members"
              selectedIds={values.responsibleIds}
              onToggle={alternarResponsavel}
              emptyLabel="Ninguém no cadastro de membros ainda."
            />
          </div>
        </div>
        <footer className="event-form-actions"><button type="button" className="record-cancel" disabled={submitting} onClick={onClose}>Cancelar</button><button className="record-save" disabled={submitting}>{submitting ? "Salvando..." : "Salvar Evento"}</button></footer>
      </form>
    </div>
  );
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

/**
 * A data de uma célula do calendário como 'YYYY-MM-DD', dos componentes LOCAIS
 * -- que é como a grade a construiu (`new Date(ano, mês, dia)`). NÃO é
 * `toISOString()`: aquele converte para UTC e, das 21h à meia-noite em Brasília,
 * devolveria o dia seguinte -- o mesmo defeito que o fuso da igreja consertou no
 * "hoje". E NÃO é cálculo de "hoje" nem de fuso: a célula JÁ É um dia específico,
 * e isto só o serializa sem deslocar. O fuso mora em lib/datas.ts.
 */
function dataDoDia(date: Date) {
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mes}-${dia}`;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(date.getDate() - date.getDay());
  return start;
}

function eventsInNextDays(events: CalendarEvent[], days: number) {
  const start = startOfToday();
  const end = new Date(start);
  end.setDate(start.getDate() + days);
  return events.filter((event) => {
    const date = new Date(event.startsAt);
    return date >= start && date <= end;
  }).length;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function monthShort(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "").toUpperCase();
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function fullDateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(new Date(value));
}
