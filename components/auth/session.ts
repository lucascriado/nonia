/**
 * Fronteira única com a API de autenticação.
 *
 * Toda tela de sessão passa por aqui — nenhuma delas monta `fetch` por conta
 * própria. Os tipos abaixo são o contrato do backend; se ele mudar, muda este
 * arquivo e o TypeScript aponta o resto.
 */

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  personId: string | null;
};

export type SessionOrganization = { id: string; name: string; slug: string };
export type SessionRole = { slug: string; name: string; level: number };

export type SessionPayload = {
  authenticated: true;
  user: SessionUser;
  organization: SessionOrganization;
  role: SessionRole;
  permissions: string[];
  expiresAt: string;
  /** Presente no login, no GET sessão e na troca de organização. */
  organizations?: SessionOrganization[];
};

export type SessionResponse = SessionPayload | { authenticated: false };

export type Invite = {
  email: string;
  fullName: string | null;
  organizationName: string;
  roleName: string;
  expiresAt: string;
  /** Já existe conta com esse e-mail: peça a senha ATUAL, não uma senha nova. */
  hasAccount: boolean;
};

/** Erro da API já com a mensagem em pt-BR que o backend devolveu. */
export class AuthError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

// Rede fora do ar, HTML no lugar de JSON, 502 do proxy: o usuário não pode
// receber "undefined" na tela por causa disso.
const fallbackMessages: Record<string, string> = {
  offline: "Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.",
  unexpected: "Algo deu errado de nosso lado. Tente de novo em instantes.",
  too_many_attempts: "Muitas tentativas seguidas. Espere alguns minutos antes de tentar de novo.",
  password_locked:
    "Muitas tentativas com a senha atual. Por segurança, seu acesso fica bloqueado por 15 minutos — isso vale também para entrar de novo. Tente mais tarde.",
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new AuthError(fallbackMessages.offline, "offline", 0);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const parsed = body as { error?: string; code?: string } | null;
    const code = parsed?.code ?? "unexpected";
    const message = parsed?.error ?? fallbackMessages[code] ?? fallbackMessages.unexpected;
    throw new AuthError(message, code, response.status);
  }

  return body as T;
}

function json(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

export type RegisterInput = {
  organizationName: string;
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  document?: string;
  organizationSlug?: string;
};

export function register(input: RegisterInput) {
  return request<SessionPayload>("/api/auth/register", json(input));
}

export function login(input: { email: string; password: string; organizationSlug?: string }) {
  return request<SessionPayload>("/api/auth/login", json(input));
}

export function logout() {
  return request<{ ok: true }>("/api/auth/logout", json({}));
}

/**
 * Devolve `{ authenticated: false }` com status 200 quando não há sessão — de
 * propósito, para a tela sondar sem sujar o console com 401.
 */
export function getSession() {
  return request<SessionResponse>("/api/auth/session");
}

export function getInvite(token: string) {
  return request<Invite>(`/api/auth/invite?token=${encodeURIComponent(token)}`);
}

export function acceptInvite(input: { token: string; password: string; fullName?: string }) {
  return request<SessionPayload>("/api/auth/invite/accept", json(input));
}

/**
 * Troca da própria senha. Exige sessão e a senha atual.
 *
 * O 200 vem com um cookie de sessão NOVO: as outras sessões da pessoa são
 * revogadas, mas quem trocou continua logado. Não redirecione para /entrar.
 */
export function changePassword(input: { currentPassword: string; newPassword: string }) {
  return request<{ ok: true }>("/api/auth/password", json(input));
}

export function switchOrganization(input: { organizationSlug?: string; organizationId?: string }) {
  return request<SessionPayload>("/api/auth/switch", json(input));
}

/** Mínimo de 8 caracteres, com letras e números — a mesma regra do backend. */
export function passwordProblem(password: string) {
  if (password.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "A senha precisa misturar letras e números.";
  return null;
}

export function emailProblem(email: string) {
  if (!email.trim()) return "Informe o e-mail.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return "Esse e-mail não parece válido.";
  return null;
}
