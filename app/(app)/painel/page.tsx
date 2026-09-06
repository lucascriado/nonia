"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cake, CalendarDays, MapPin, Network, PartyPopper, Settings, UserPlus, Users } from "lucide-react";
import { Calendar } from "@/components/calendar";
import { DashboardShell } from "@/components/dashboard-shell";
import { AnimatedNumber } from "@/components/animated-number";
import { toast } from "sonner";
import { ActivitySkeleton, NumberSkeleton, Skeleton } from "@/components/skeleton";

type DashboardData = {
  stats: { totalMembers: number; visitorsThisMonth: number; activeCells: number; birthdaysThisMonth: number };
  activities: Array<{ id: string; category: string; actor: string; action: string; subject: string; occurredAt: string }>;
  birthdays: Array<{ id: string; name: string; birthDate: string }>;
  events: Array<{ id: string; title: string; location: string; startsAt: string; color: string }>;
};

const emptyData: DashboardData = { stats: { totalMembers: 0, visitorsThisMonth: 0, activeCells: 0, birthdaysThisMonth: 0 }, activities: [], birthdays: [], events: [] };

export default function Dashboard() {
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(setData)
      .catch(() => toast.error("Não foi possível carregar a dashboard"))
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: "Membros ativos", value: data.stats.totalMembers, icon: Users, color: "green" },
    { label: "Visitantes no mês", value: data.stats.visitorsThisMonth, icon: UserPlus, color: "blue" },
    { label: "Células ativas", value: data.stats.activeCells, icon: Network, color: "purple" },
    { label: "Aniversariantes do mês", value: data.stats.birthdaysThisMonth, icon: Cake, color: "blue" },
  ];

  return (
    <DashboardShell title="Dashboard">
      <main>
        <section className="stats" aria-label="Indicadores">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <article className="stat-card" key={label}>
              <span className={`stat-icon ${color}`}><Icon /></span>
              <span className="eyebrow">{label}</span>
              <strong>{loading ? <NumberSkeleton /> : <AnimatedNumber value={value} />}</strong>
            </article>
          ))}
        </section>

        <section className="dashboard-grid">
          <article className="panel calendar-panel"><Calendar events={data.events} /></article>

          <article className="panel activities">
            <div className="panel-header"><h2>Atividades Recentes</h2><Link className="text-button" href="/atividades">Ver histórico</Link></div>
            <div className="activity-list">
              {loading && <ActivitySkeleton count={5} />}
              {!loading && data.activities.map((activity) => (
                <div className="activity" key={activity.id}>
                  <span className={`activity-icon ${activity.category === "visitors" ? "blue" : activity.category === "calendar" ? "green" : "purple"}`}>
                    {activity.category === "calendar" ? <CalendarDays /> : activity.category === "system" ? <Settings /> : activity.category === "visitors" ? <UserPlus /> : <Users />}
                  </span>
                  <span><strong>{activity.actor} {activity.action}{activity.subject ? ` ${activity.subject}` : ""}</strong><small>{formatDate(activity.occurredAt)}</small></span>
                </div>
              ))}
              {!loading && !data.activities.length && <p className="data-empty">Nenhuma atividade registrada.</p>}
            </div>
          </article>

          <article className="panel events">
            <div className="panel-header"><h2>Próximos Eventos</h2></div>
            {loading && <EventSkeleton />}
            {!loading && (
              <div className="event-list">
                {data.events.slice(0, 4).map((event) => (
                  <Link className={`event ${event.color}-border`} href={`/calendario?event=${event.id}`} key={event.id}>
                    <div className="date"><strong>{new Date(event.startsAt).getDate()}</strong><small>{monthShort(event.startsAt)}</small></div>
                    <div><strong>{event.title}</strong><small><MapPin /> {event.location}</small></div>
                  </Link>
                ))}
              </div>
            )}
            {!loading && !data.events.length && <p className="data-empty">Nenhum evento cadastrado.</p>}
          </article>

          <article className="panel birthdays">
            <h2>Aniversariantes do mês</h2>
            {loading && Array.from({ length: 4 }, (_, index) => (
              <div className="birthday birthday-skeleton" key={index}><Skeleton className="skeleton-circle" /><span className="birthday-skeleton-lines"><Skeleton className="skeleton-title" /><Skeleton className="skeleton-text" /></span></div>
            ))}
            {!loading && data.birthdays.map((person, index) => (
              <div className="birthday" key={person.id}>
                <span className={`birthday-avatar avatar-${index % 4}`}>{initialsFrom(person.name)}</span>
                <span><strong>{person.name}</strong><small>{birthdayDate(person.birthDate)}</small></span>
                <a aria-label={`Parabenizar ${person.name}`} href={birthdayWhatsappLink(person.name)} target="_blank" rel="noreferrer"><PartyPopper /></a>
              </div>
            ))}
            {!loading && !data.birthdays.length && <p className="data-empty">Nenhum aniversário registrado neste mês.</p>}
          </article>
        </section>
      </main>
    </DashboardShell>
  );
}

function initialsFrom(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function birthdayDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(value));
}

function birthdayWhatsappLink(name: string) {
  const message = `Olá, ${name}! Desejamos um feliz aniversário, com muita graça, paz e bênçãos neste novo ciclo.`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function monthShort(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(value)).replace(".", "");
}

function EventSkeleton() {
  return <div className="event-skeleton-list">{Array.from({ length: 4 }, (_, index) => <div className="event-skeleton" key={index}><Skeleton className="event-skeleton-date" /><span><Skeleton className="skeleton-title" /><Skeleton className="skeleton-text" /></span></div>)}</div>;
}
