"use client";

import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  Church,
  History,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Puzzle,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { Ref } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, initialsFrom } from "@/components/avatar";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { useSession } from "@/components/current-user";

// Novas rotas de menu entram aqui. O campo `section` define em qual grupo o
// item aparece; a ordem dos grupos segue a primeira ocorrência na lista.
// Cada item declara a permissão que o sustenta. Sem isso o menu oferecia
// Financeiro e Usuários para o papel de leitura, que recebe 403 ao abrir - e o
// defeito só aparecia ao TROCAR de igreja, porque na igreja de origem a mesma
// pessoa era proprietária.
// Configurações não pede permissão: o perfil é de quem está logado.
const primaryLinks = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/painel", section: "Visão geral", permission: "dashboard.read" },
  { label: "Calendário", icon: CalendarDays, href: "/calendario", section: "Visão geral", permission: "events.read" },
  { label: "Atividades", icon: History, href: "/atividades", section: "Visão geral", permission: "activities.read" },
  { label: "Membros", icon: Users, href: "/membros", section: "Comunidade", permission: "members.read" },
  { label: "Visitantes", icon: UserPlus, href: "/visitantes", section: "Comunidade", permission: "visitors.read" },
  { label: "Ministérios", icon: Puzzle, href: "/ministerios", section: "Comunidade", permission: "ministries.read" },
  { label: "WhatsApp", icon: MessageCircle, href: "/whatsapp", section: "Comunidade", permission: "whatsapp.read" },
  { label: "Financeiro", icon: Wallet, href: "/financeiro", section: "Administração", permission: "finance.read" },
  { label: "Usuários", icon: ShieldCheck, href: "/usuarios", section: "Administração", permission: "users.read" },
  { label: "Configurações", icon: Settings, href: "/configuracoes", section: "Administração", permission: null },
];

function sectionsFor(permissions: string[]) {
  const allowed = primaryLinks.filter((link) => !link.permission || permissions.includes(link.permission));
  return Array.from(new Set(allowed.map((link) => link.section))).map((section) => ({
    section,
    links: allowed.filter((link) => link.section === section),
  }));
}

export function Sidebar({ sidebarRef }: { sidebarRef?: Ref<HTMLElement> }) {
  const pathname = usePathname();
  const { user, organization, organizations, permissions, loading } = useSession();
  // Enquanto a sessão não volta, mostra tudo: esconder e revelar pisca o menu
  // inteiro a cada carregamento.
  const navSections = sectionsFor(loading ? primaryLinks.map((link) => link.permission ?? "") : permissions);

  return (
    <aside className="sidebar" ref={sidebarRef}>
      <div className="brand">
        <Link className="brand-link" href="/painel" aria-label="Ir para a dashboard" title="Dashboard">
          <span className="brand-icon" aria-hidden><Church /></span>
          <span className="brand-text"><strong>nonia</strong><small>A sua igreja organizada</small></span>
        </Link>
        <Link className="brand-action" href="/membros" aria-label="Cadastrar novo membro" title="Novo membro">
          <UserPlus />
        </Link>
        <label className="sidebar-collapse-button" htmlFor="sidebar-collapse" aria-label="Recolher menu" title="Recolher menu">
          <ChevronLeft />
        </label>
      </div>

      <div className="sidebar-scroll">
        {/* SEMPRE o seletor, inclusive com uma igreja só. Antes ele só
            aparecia a partir de duas, e o resultado era um absurdo: "criar
            nova igreja" mora dentro dele, então a porta de criar a SEGUNDA
            ficava trancada atrás de já ter duas. Ninguém com uma igreja
            chegava lá -- e uma igreja é o caso de todo mundo. */}
        <OrganizationSwitcher />

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

        {/* O rótulo passa a combinar com o destino. Antes dizia "Fale com a
            gente" e era um `mailto:` -- e onde o mailto ia parar dependia da
            máquina de quem clicava, o que fez o Lucas cair numa página que
            ninguém tinha escrito. Agora leva à documentação, que é uma página
            de verdade; e o caminho humano continua existindo, dentro dela,
            que é onde está quem não achou a resposta. */}
        <Link className="sidebar-promo" href="/ajuda" title="Documentação do nonia">
          <i aria-hidden><BookOpen /></i>
          <span><strong>Documentação</strong><small>Como cada parte funciona</small></span>
        </Link>
      </div>

      <div className="sidebar-footer">
        <nav className="nav-list nav-footer" aria-label="Navegação secundária">
          <SignOutButton />
        </nav>

        {/* SEM a seta dupla. Seta para cima e para baixo em chip de usuário
            quer dizer "trocar de conta" em qualquer produto, e aqui isto é um
            link para uma página -- não há menu, não há segunda conta para
            escolher. O Lucas leu exatamente isso: achou que dava para ter mais
            de um usuário porque a seta prometia. Quem tem menu de verdade é o
            seletor de igreja, e lá a seta continua. */}
        <Link className="sidebar-user" href="/configuracoes" title="Sua conta">
          <Avatar name={user.name} photoUrl={user.avatarUrl} size={30} />
          <span><strong>{user.name}</strong><small>{user.role}</small></span>
        </Link>
      </div>
    </aside>
  );
}
