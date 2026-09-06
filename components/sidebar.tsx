"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronsUpDown,
  Church,
  History,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Network,
  Puzzle,
  Settings,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { Ref } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, initialsFrom } from "@/components/avatar";
import { useSession } from "@/components/current-user";

// Novas rotas de menu entram aqui. O campo `section` define em qual grupo o
// item aparece; a ordem dos grupos segue a primeira ocorrência na lista.
const primaryLinks = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/painel", section: "Visão geral" },
  { label: "Calendário", icon: CalendarDays, href: "/calendario", section: "Visão geral" },
  { label: "Atividades", icon: History, href: "/atividades", section: "Visão geral" },
  { label: "Membros", icon: Users, href: "/membros", section: "Comunidade" },
  { label: "Visitantes", icon: UserPlus, href: "/visitantes", section: "Comunidade" },
  { label: "Células", icon: Network, href: "/celulas", section: "Comunidade" },
  { label: "Ministérios", icon: Puzzle, href: "/ministerios", section: "Comunidade" },
  { label: "Financeiro", icon: Wallet, href: "/financeiro", section: "Administração" },
  { label: "Configurações", icon: Settings, href: "/configuracoes", section: "Administração" },
];

const navSections = Array.from(new Set(primaryLinks.map((link) => link.section))).map((section) => ({
  section,
  links: primaryLinks.filter((link) => link.section === section),
}));

export function Sidebar({ sidebarRef }: { sidebarRef?: Ref<HTMLElement> }) {
  const pathname = usePathname();
  const { user, organization } = useSession();

  return (
    <aside className="sidebar" ref={sidebarRef}>
      <div className="brand">
        <Link className="brand-link" href="/painel" aria-label="Ir para a dashboard" title="Dashboard">
          <span className="brand-icon" aria-hidden><Church /></span>
          <span className="brand-text"><strong>Nonia</strong><small>Gestão ministerial</small></span>
        </Link>
        <Link className="brand-action" href="/membros" aria-label="Cadastrar novo membro" title="Novo membro">
          <UserPlus />
        </Link>
        <label className="sidebar-collapse-button" htmlFor="sidebar-collapse" aria-label="Recolher menu" title="Recolher menu">
          <ChevronLeft />
        </label>
      </div>

      <div className="sidebar-scroll">
        <Link className="workspace-card" href="/configuracoes" title="Espaço de trabalho">
          <span className="workspace-avatar" aria-hidden>{initialsFrom(organization?.name ?? "Nonia")}</span>
          <span><strong>{organization?.name ?? "Sua igreja"}</strong><small>Espaço de trabalho</small></span>
          <ChevronsUpDown aria-hidden />
        </Link>

        {navSections.map(({ section, links }) => (
          <div className="nav-section" key={section}>
            <span className="nav-section-label">{section}</span>
            <nav className="nav-list" aria-label={section}>
              {links.map(({ label, icon: Icon, href }) => (
                <Link className={pathname === href ? "active" : undefined} href={href} key={label} title={label}>
                  <Icon aria-hidden /><span>{label}</span>
                </Link>
              ))}
            </nav>
          </div>
        ))}

        <a className="sidebar-promo" href="mailto:suporte@nonia.app" title="Falar com o suporte">
          <i aria-hidden><LifeBuoy /></i>
          <span><strong>Central de apoio</strong><small>Fale com a gente</small></span>
        </a>
      </div>

      <div className="sidebar-footer">
        <nav className="nav-list nav-footer" aria-label="Navegação secundária">
          <a href="#" title="Sair"><LogOut aria-hidden /><span>Sair</span></a>
        </nav>

        <Link className="sidebar-user" href="/configuracoes" title="Perfil da conta">
          <Avatar name={user.name} photoUrl={user.avatarUrl} size={30} />
          <span><strong>{user.name}</strong><small>{user.role}</small></span>
          <ChevronsUpDown aria-hidden />
        </Link>
      </div>
    </aside>
  );
}
