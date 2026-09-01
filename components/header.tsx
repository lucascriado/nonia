"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  History,
  LayoutDashboard,
  Menu,
  Moon,
  Network,
  Puzzle,
  Search,
  Settings,
  Sun,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { readPreferences, savePreferences } from "@/components/app-preferences";

const searchItems = [
  { title: "Dashboard", description: "Indicadores, atividades recentes e próximos eventos", href: "/", icon: LayoutDashboard, keywords: "inicio painel indicadores atividades eventos aniversario" },
  { title: "Membros", description: "Cadastro, filtros, edição e visualização de membros", href: "/membros", icon: Users, keywords: "membros pessoas cadastro batismo ministerio celula" },
  { title: "Visitantes", description: "Acompanhamento, integração e conversão para membro", href: "/visitantes", icon: UserPlus, keywords: "visitantes acompanhamento contato integrado converter" },
  { title: "Calendário", description: "Agenda, eventos, cultos e reuniões", href: "/calendario", icon: CalendarDays, keywords: "calendario agenda eventos culto reuniao batismo" },
  { title: "Atividades", description: "Histórico de alterações do sistema", href: "/atividades", icon: History, keywords: "historico logs atividades alteracoes" },
  { title: "Células", description: "Pequenos grupos, líderes, membros e encontros", href: "/celulas", icon: Network, keywords: "celulas pequenos grupos lider membros presenca" },
  { title: "Ministérios", description: "Equipes, voluntários e chamada da escola bíblica", href: "/ministerios", icon: Puzzle, keywords: "ministerios voluntarios escola biblica chamada presenca domingo" },
  { title: "Financeiro", description: "Entradas, saídas, comprovantes e saldo disponível", href: "/financeiro", icon: Wallet, keywords: "financeiro dizimo oferta despesa saldo lancamento comprovante" },
  { title: "Configurações", description: "Perfil, tema, idioma e preferências da plataforma", href: "/configuracoes", icon: Settings, keywords: "configuracoes preferencias tema idioma fonte perfil" },
];

// Algumas páginas passam um título mais longo ("Gestão de Células"), então a
// legenda também é procurada por correspondência parcial.
function subtitleFor(title: string) {
  const normalized = title.toLocaleLowerCase("pt-BR");
  return searchItems.find((item) => item.title.toLocaleLowerCase("pt-BR") === normalized)?.description
    ?? searchItems.find((item) => normalized.includes(item.title.toLocaleLowerCase("pt-BR")))?.description;
}

export function Header({ title }: { title: string }) {
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(readPreferences().theme);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    savePreferences({ theme: next });
  }

  const subtitle = subtitleFor(title);
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const results = useMemo(() => {
    if (!normalizedSearch) return searchItems.slice(0, 5);
    return searchItems
      .filter((item) => `${item.title} ${item.description} ${item.keywords}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch))
      .slice(0, 6);
  }, [normalizedSearch]);

  return (
    <header className="topbar">
      <label className="icon-button menu-button" htmlFor="menu-toggle" aria-label="Abrir menu" data-sidebar-trigger>
        <Menu />
      </label>

      <div className="topbar-title">
        <h1>{title}</h1>
        {subtitle && <span className="topbar-subtitle">{subtitle}</span>}
      </div>

      <label className="search global-search">
        <Search />
        <input
          type="search"
          placeholder="Buscar páginas, eventos ou cadastros..."
          aria-label="Busca global do sistema"
          value={search}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onChange={(event) => setSearch(event.target.value)}
          onFocus={() => setFocused(true)}
        />
        <kbd aria-hidden>Ctrl K</kbd>
        {focused && (search || results.length > 0) && (
          <div className="global-search-results">
            {results.map(({ title: itemTitle, description, href, icon: Icon }) => (
              <Link href={href} key={href} onClick={() => setSearch("")}>
                <Icon />
                <span><strong>{itemTitle}</strong><small>{description}</small></span>
              </Link>
            ))}
            {!results.length && <p>Nenhum destino encontrado.</p>}
          </div>
        )}
      </label>

      <button
        className="icon-button"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
        title={theme === "dark" ? "Tema claro" : "Tema escuro"}
      >
        {theme === "dark" ? <Sun /> : <Moon />}
      </button>
      <button className="icon-button has-dot" aria-label="Notificações"><Bell /></button>
      <span className="divider" />
      <div className="user">
        <span><strong>Pr. Renato</strong><small>Administrador</small></span>
        <Image src="/renato.png" alt="Pr. Renato" width={30} height={30} priority />
      </div>
    </header>
  );
}
