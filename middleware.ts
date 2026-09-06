import { NextResponse, type NextRequest } from "next/server";

// Roda no Edge, onde não há acesso ao Postgres nem ao node:crypto. Por isso
// aqui só existe a checagem barata de "tem cookie de sessão?", que serve para
// desviar a navegação. Quem valida a sessão de verdade -- token, expiração,
// organização e permissão -- é o requireSession()/requirePermission() dentro
// de cada rota de app/api, que é onde os dados são realmente lidos.

const SESSION_COOKIE = "nonia_session";

const PUBLIC_API = [
  "/api/health",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/auth/invite",
  "/api/auth/invite/accept",
];

const PUBLIC_PAGES = ["/entrar", "/cadastro", "/recuperar-senha", "/convite"];

const isPublicApi = (pathname: string) => PUBLIC_API.includes(pathname);

const isPublicPage = (pathname: string) =>
  PUBLIC_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname) || hasSession) return NextResponse.next();
    return NextResponse.json(
      { error: "Sessão expirada ou inexistente.", code: "unauthenticated" },
      { status: 401 },
    );
  }

  if (isPublicPage(pathname)) {
    if (hasSession) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (!hasSession) {
    const login = new URL("/entrar", request.url);
    // Devolve o usuário para onde ele tentou ir depois de entrar.
    if (pathname !== "/") login.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Tudo, menos estáticos do Next, o ícone e arquivos com extensão.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.[\\w]+$).*)",
  ],
};
