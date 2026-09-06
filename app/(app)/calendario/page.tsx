"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Plus, Trash2, X } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { toast } from "sonner";
import { DeleteRecordDialog } from "@/components/person-record-dialog";

type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  location: string;
  startsAt: string;
  endsAt?: string | null;
  category: string;
  color: "purple" | "green" | "blue";
};

type EventFormValues = {
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  color: CalendarEvent["color"];
};

type CalendarView = "month" | "week" | "day";

const weekdays = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const categoryOptions = [
  { label: "Cultos", color: "blue" },
  { label: "Ministérios", color: "purple" },
  { label: "Ações Sociais", color: "green" },
] as const;

const emptyForm: EventFormValues = { title: "", description: "", location: "", date: "", time: "", color: "purple" };

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleDate, setVisibleDate] = useState(() => new Date());
  const [monthTransition, setMonthTransition] = useState<"next" | "previous" | "today">("today");
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [creating, setCreating] = useState(false);
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
      body: JSON.stringify({ title: values.title, description: values.description, location: values.location, startsAt, color: values.color }),
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
                <button className="primary-action calendar-new-event" onClick={() => setCreating(true)}><Plus />Novo Evento</button>
              </div>
            </header>

            {calendarView === "month" && (
              <div className={`calendar-month-grid month-transition-${monthTransition}`} aria-busy={loading} key={`month-${year}-${month}`}>
                {weekdays.map((weekday) => <div className="calendar-weekday" key={weekday}>{weekday}</div>)}
                {days.map((day) => (
                  <div className={`calendar-day-cell ${day.outside ? "outside" : ""}`} key={day.key}>
                    <span>{day.number}</span>
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
      {selectedEvent && <EventDetailsModal event={selectedEvent} onClose={closeEvent} onDelete={() => setDeleteTarget(selectedEvent)} />}
      {creating && <EventFormModal onClose={() => setCreating(false)} onSubmit={createEvent} />}
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

function EventDetailsModal({ event, onClose, onDelete }: { event: CalendarEvent; onClose: () => void; onDelete: () => void }) {
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
          {event.description && <article>{event.description}</article>}
        </div>
        <footer className="event-form-actions"><button className="event-delete-button" onClick={onDelete}><Trash2 />Excluir Evento</button></footer>
      </section>
    </div>
  );
}

function EventFormModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (values: EventFormValues) => Promise<boolean> }) {
  const [values, setValues] = useState<EventFormValues>(() => ({ ...emptyForm, date: new Date().toISOString().slice(0, 10) }));
  const [submitting, setSubmitting] = useState(false);

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
        </div>
        <footer className="event-form-actions"><button type="button" className="record-cancel" disabled={submitting} onClick={onClose}>Cancelar</button><button className="record-save" disabled={submitting}>{submitting ? "Salvando..." : "Salvar Evento"}</button></footer>
      </form>
    </div>
  );
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
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
