// Classificação das telas: quem é sistema logado e quem é site público.
//
// Mora aqui, e não dentro do proxy.ts, porque dois lugares precisam da mesma
// lista: o proxy, que desvia quem não tem sessão, e o AppSession do layout
// raiz, que só liga o provider de sessão nas telas do sistema. Duas cópias
// dessa lista divergiriam um dia, e a do provider seria a invisível.
//
// As rotas moram direto em app/, sem pasta de agrupamento, então é esta
// classificação que diz de que lado cada uma está. `npm run check:rotas`
// recusa pasta de app/ que não esteja em nenhuma das duas listas.

/**
 * Telas do sistema. Exigem sessão e ganham o provider de sessão.
 * Ao criar uma tela nova do sistema, acrescente o caminho dela nesta lista.
 */
export const APP_PAGES = [
  "/painel",
  "/membros",
  "/visitantes",
  "/ministerios",
  "/calendario",
  "/financeiro",
  "/atividades",
  "/configuracoes",
  "/usuarios",
  "/whatsapp",
  "/ajuda",
];

/**
 * Páginas do site público, além da landing em `/`. Usam o MarketingFrame no
 * layout.tsx da própria rota.
 */
export const PUBLIC_PAGES = [
  "/faq",
  "/precos",
  "/entrar",
  "/cadastro",
  "/convite",
];

/** Páginas que deixam de fazer sentido depois de entrar. */
export const GUEST_ONLY_PAGES = ["/entrar", "/cadastro"];

export const matchesPath = (pathname: string, paths: string[]) =>
  paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));

export const isAppPage = (pathname: string) => matchesPath(pathname, APP_PAGES);
