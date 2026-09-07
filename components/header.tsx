"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CalendarDays,
  History,
  LayoutDashboard,
  MessageCircle,
  Menu,
  Puzzle,
  Search,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useCurrentUser } from "@/components/current-user";

const searchItems = [
  { title: "Dashboard", description: "Indicadores, atividades recentes e próximos eventos", href: "/painel", icon: LayoutDashboard, keywords: "inicio painel indicadores atividades eventos aniversario" },
  { title: "Membros", description: "Cadastro, filtros, edição e visualização de membros", href: "/membros", icon: Users, keywords: "membros pessoas cadastro batismo ministerio" },
  { title: "Visitantes", description: "Acompanhamento, integração e conversão para membro", href: "/visitantes", icon: UserPlus, keywords: "visitantes acompanhamento contato integrado converter" },
  { title: "Calendário", description: "Agenda, eventos, cultos e reuniões", href: "/calendario", icon: CalendarDays, keywords: "calendario agenda eventos culto reuniao batismo" },
  { title: "Atividades", description: "Histórico de alterações do sistema", href: "/atividades", icon: History, keywords: "historico logs atividades alteracoes" },
  { title: "Ministérios", description: "Equipes, voluntários e chamada da escola bíblica", href: "/ministerios", icon: Puzzle, keywords: "ministerios voluntarios escola biblica chamada presenca domingo" },
  { title: "WhatsApp", description: "Conversas da igreja, envio em massa e conexão do número", href: "/whatsapp", icon: MessageCircle, keywords: "whatsapp zap mensagem envio massa disparo conectar qr conversa caixa entrada responder encaminhar" },
  { title: "Financeiro", description: "Entradas, saídas, comprovantes e saldo disponível", href: "/financeiro", icon: Wallet, keywords: "financeiro dizimo oferta despesa saldo lancamento comprovante" },
  { title: "Usuários", description: "Quem tem acesso ao painel e com qual papel", href: "/usuarios", icon: ShieldCheck, keywords: "usuarios acesso papel permissao convite equipe secretaria lider" },
  { title: "Configurações", description: "Sua conta, os dados da igreja e o plano", href: "/configuracoes", icon: Settings, keywords: "configuracoes perfil conta usuario" },
];

// Algumas páginas passam um título mais longo ("Gestão de Ministérios"), então a
// legenda também é procurada por correspondência parcial.
function subtitleFor(title: string) {
  const normalized = title.toLocaleLowerCase("pt-BR");
  return searchItems.find((item) => item.title.toLocaleLowerCase("pt-BR") === normalized)?.description
    ?? searchItems.find((item) => normalized.includes(item.title.toLocaleLowerCase("pt-BR")))?.description;
}

export function Header({ title }: { title: string }) {
  const user = useCurrentUser();
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const campo = useRef<HTMLInputElement | null>(null);
  const [noMac, setNoMac] = useState(false);

  // O selinho dizia "Ctrl K" em toda máquina, e no Mac o atalho é Cmd K --
  // seria a mesma promessa vazia com outra roupa. A leitura vai DEPOIS de
  // montar para o servidor e o cliente pintarem a mesma coisa no primeiro
  // quadro; trocar isto por leitura direta reintroduz erro de hidratação.
  useEffect(() => {
    setNoMac(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent));
  }, []);

  /**
   * O atalho que o `<kbd>` anunciava e ninguém tinha ligado.
   *
   * Focar não basta: a lista só abre com `focused`, então o estado é marcado
   * junto. E `preventDefault` é obrigatório -- sem ele o Firefox leva o
   * Ctrl+K para a barra de busca dele e o nosso campo pisca e perde o foco.
   */
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key.toLowerCase() !== "k" || evento.altKey || evento.shiftKey) return;
      if (!evento.ctrlKey && !evento.metaKey) return;

      const alvo = evento.target as HTMLElement | null;
      const digitando =
        Boolean(alvo?.isContentEditable) || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo?.tagName ?? "");
      // Ctrl+K DENTRO de um campo de texto é "apagar até o fim da linha" no
      // Unix, e quem está digitando um nome não está procurando uma página.
      // Cmd+K não tem esse dono, então no Mac vale em qualquer lugar.
      if (digitando && evento.ctrlKey && !evento.metaKey && alvo !== campo.current) return;

      evento.preventDefault();
      setFocused(true);
      campo.current?.focus();
      campo.current?.select();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, []);

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
          ref={campo}
          value={search}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onChange={(event) => setSearch(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            // Esc fecha, como em todo diálogo da casa.
            if (event.key === "Escape") {
              setFocused(false);
              event.currentTarget.blur();
            }
          }}
        />
        <kbd aria-hidden>{noMac ? "⌘ K" : "Ctrl K"}</kbd>
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

      <button className="icon-button has-dot" aria-label="Notificações"><Bell /></button>
      <span className="divider" />
      <div className="user">
        <span><strong>{user.name}</strong><small>{user.role}</small></span>
        <Avatar name={user.name} photoUrl={user.avatarUrl} size={30} />
      </div>
    </header>
  );
}
