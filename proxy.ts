import { NextResponse, type NextRequest } from "next/server";
import { GUEST_ONLY_PAGES, isAppPage, matchesPath } from "@/lib/rotas";

// Convenção "proxy" do Next 16, que substituiu "middleware".
//
// Roda no Edge, onde não há acesso ao Postgres nem ao node:crypto. Por isso
// aqui só existe a checagem barata de "tem cookie de sessão?", que serve para
// desviar a navegação. Quem valida a sessão de verdade -- token, expiração,
// organização e permissão -- é o requireSession()/requirePermission() dentro
// de cada rota de app/api, que é onde os dados são realmente lidos. Uma tela
// alcançada com cookie forjado não mostra nada: as APIs respondem 401.

const SESSION_COOKIE = "nonia_session";

/** Painel para onde vai quem já está autenticado. */
const HOME = "/painel";
const LOGIN = "/entrar";

const PUBLIC_API = [
  "/api/health",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/auth/invite",
  "/api/auth/invite/accept",
];

// As telas do sistema (APP_PAGES) estão em lib/rotas.ts. Tudo que não estiver
// lá é tratado como página pública -- landing, preços, FAQ e o que vier.

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API.includes(pathname) || hasSession) return NextResponse.next();
    return NextResponse.json(
      { error: "Sessão expirada ou inexistente.", code: "unauthenticated" },
      { status: 401 },
    );
  }

  if (isAppPage(pathname)) {
    if (hasSession) return NextResponse.next();
    const login = new URL(LOGIN, request.url);
    // Devolve o usuário para onde ele tentou ir depois de entrar.
    login.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  // Quem já entrou não fica na landing nem nas telas de acesso.
  if (hasSession && (pathname === "/" || matchesPath(pathname, GUEST_ONLY_PAGES))) {
    return NextResponse.redirect(new URL(HOME, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Tudo, menos estáticos do Next, o ícone e arquivos com extensão.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.[\\w]+$).*)",
  ],
};
