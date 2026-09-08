"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
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
  { title: "Documentação", description: "Como cada parte do nonia funciona, recurso por recurso", href: "/ajuda", icon: BookOpen, keywords: "ajuda documentacao duvidas suporte manual como funciona faq" },
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
  /**
   * O sino ABRE um painel, e o painel diz a verdade: não há notificação.
   *
   * Antes ele não tinha `onClick` -- clicar só movia o foco -- e carregava a
   * classe `has-dot` CHUMBADA, o pontinho vermelho de "tem coisa nova". Numa
   * igreja criada há cinco minutos, sem um único registro, o ponto já estava
   * lá: mesmo gênero do logout que era link morto, com o agravante de PROMETER.
   * O ponto some (não há o que anunciar) e o botão passa a fazer algo honesto:
   * mostrar o estado vazio, como toda listagem da casa. Quando existir origem
   * de notificação de verdade, é aqui que a lista entra.
   */
  const [notifAberto, setNotifAberto] = useState(false);
  const notif = useRef<HTMLDivElement | null>(null);

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
      // A guarda que engolia Ctrl+K num campo de texto ENCOLHEU para onde ela
      // realmente protege algo: só o Mac. O raciocínio, medido, é uma assimetria.
      //
      // Ctrl+K = "apagar até o fim da linha" é comportamento do Cocoa (e de quem
      // configurou keymap emacs). No MAC, onde ele existe de verdade, o atalho do
      // app é Cmd+K, então guardar Ctrl+K não custa nada e preserva o kill-line.
      // No Linux/Windows esse kill-line NÃO é padrão em campo de navegador -- e é
      // justamente ali que o atalho anunciado É Ctrl+K. A guarda antiga, valendo
      // em toda plataforma, matava em SILÊNCIO o atalho anunciado bem onde ele
      // precisa funcionar: medido, ele abria a busca com o foco no body em todas
      // as rotas, e era engolido assim que o foco caía num filtro ou num diálogo.
      // Proteção que só atua onde não há o que proteger; atalho anunciado que não
      // funciona é pior que atalho inexistente, porque a pessoa culpa a si mesma.
      //
      // Por isso: dispara pelo atalho DA PLATAFORMA -- Cmd+K no Mac, Ctrl+K no
      // resto -- SEM olhar o foco. A guarda passa a valer só para o modificador
      // que NÃO é o atalho da plataforma, que hoje é apenas o Ctrl no Mac, que
      // segue com o sistema. Custo aceito: no Linux com keymap emacs, Ctrl+K num
      // campo do app abre a busca em vez de apagar a linha -- raro, e quem tem
      // esse keymap sabe o que fez.
      if (noMac && digitando && evento.ctrlKey && !evento.metaKey && alvo !== campo.current) return;

      // `preventDefault` continua obrigatório para o atalho da plataforma: sem
      // ele o Firefox leva o Ctrl+K para a barra de busca dele e o nosso campo
      // pisca e perde o foco.
      evento.preventDefault();
      setFocused(true);
      campo.current?.focus();
      campo.current?.select();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [noMac]);

  // Fecha o painel do sino ao clicar fora ou apertar Esc, como todo menu da casa.
  useEffect(() => {
    if (!notifAberto) return;
    function aoClicarFora(evento: PointerEvent) {
      if (evento.target instanceof Node && !notif.current?.contains(evento.target)) setNotifAberto(false);
    }
    function aoEscapar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setNotifAberto(false);
    }
    document.addEventListener("pointerdown", aoClicarFora);
    document.addEventListener("keydown", aoEscapar);
    return () => {
      document.removeEventListener("pointerdown", aoClicarFora);
      document.removeEventListener("keydown", aoEscapar);
    };
  }, [notifAberto]);

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
          placeholder="Buscar páginas do sistema…"
          aria-label="Buscar páginas do sistema"
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

      <div className="notif" ref={notif}>
        <button
          className="icon-button"
          aria-label="Notificações"
          aria-expanded={notifAberto}
          aria-haspopup="dialog"
          onClick={() => setNotifAberto((valor) => !valor)}
          type="button"
        >
          <Bell />
        </button>
        {notifAberto && (
          <div className="notif-popover" role="dialog" aria-label="Notificações">
            <strong>Notificações</strong>
            <div className="notif-empty">
              <Bell aria-hidden />
              <p>Você está em dia. Nada de novo por aqui ainda.</p>
            </div>
          </div>
        )}
      </div>
      <span className="divider" />
      <div className="user">
        <span><strong>{user.name}</strong><small>{user.role}</small></span>
        <Avatar name={user.name} photoUrl={user.avatarUrl} size={30} />
      </div>
    </header>
  );
}
