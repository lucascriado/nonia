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
  /** Identidade de login: não é editável. */
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  personId: string | null;
};

export type SessionOrganization = { id: string; name: string; slug: string };

/**
 * Uma igreja da pessoa, como vem do GET /api/organizations. É o mesmo conjunto
 * que `SessionPayload.organizations`, mais o PAPEL em cada uma — a mesma pessoa
 * pode ser proprietária numa e leitura noutra, e é isso que muda o que ela vai
 * encontrar do outro lado da troca.
 */
export type MembershipOrganization = SessionOrganization & {
  roleSlug: string;
  roleName: string;
  isDefault: boolean;
  joinedAt: string;
};
export type SessionRole = { slug: string; name: string; level: number };

/**
 * Estado do plano da organização. Vem só no GET /api/auth/session: resolver o
 * plano em toda requisição autenticada custaria uma consulta a mais só para
 * desenhar uma faixa.
 *
 * `maxMembers`/`maxUsers` em null significam ILIMITADO, não zero.
 */
export type SessionPlan = {
  slug: string;
  name: string;
  source: "trial" | "subscription" | "free";
  maxMembers: number | null;
  maxUsers: number | null;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  trialExpired: boolean;
  access: {
    /**
     * `full` normal; `grace` é a carência de 7 dias depois do vencimento, em
     * que tudo ainda funciona; `read_only` é depois dela, quando consultar e
     * exportar seguem valendo e cadastrar e editar param.
     */
    level: "full" | "grace" | "read_only";
    graceEndsAt: string | null;
    graceDaysLeft: number | null;
    pastDuePlan: string | null;
  };
  usage: { members: number; users: number };
};

export type SessionPayload = {
  authenticated: true;
  user: SessionUser;
  organization: SessionOrganization;
  role: SessionRole;
  permissions: string[];
  expiresAt: string;
  /** Presente no login, no GET sessão e na troca de organização. */
  organizations?: SessionOrganization[];
  /** Só no GET sessão — as outras rotas não resolvem o plano. */
  plan?: SessionPlan;
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

/** Exportado para os módulos vizinhos (billing) reusarem o mesmo tratamento
 *  de erro: mensagem em pt-BR do servidor, fallback quando não vem JSON. */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
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
  /**
   * CNPJ ou CPF. Vai como a pessoa digitou: desde 31/07/2026 o CNPJ pode ter
   * letras, então a tela não normaliza nem valida — quem valida é o servidor,
   * e reimplementar a regra aqui só criaria duas versões dela.
   */
  document?: string;
  organizationSlug?: string;
};

export function register(input: RegisterInput) {
  return apiRequest<SessionPayload>("/api/auth/register", json(input));
}

export function login(input: { email: string; password: string; organizationSlug?: string }) {
  return apiRequest<SessionPayload>("/api/auth/login", json(input));
}

export function logout() {
  return apiRequest<{ ok: true }>("/api/auth/logout", json({}));
}

/**
 * Devolve `{ authenticated: false }` com status 200 quando não há sessão — de
 * propósito, para a tela sondar sem sujar o console com 401.
 */
export function getSession() {
  return apiRequest<SessionResponse>("/api/auth/session");
}

export function getInvite(token: string) {
  return apiRequest<Invite>(`/api/auth/invite?token=${encodeURIComponent(token)}`);
}

export function acceptInvite(input: { token: string; password: string; fullName?: string }) {
  return apiRequest<SessionPayload>("/api/auth/invite/accept", json(input));
}

/**
 * Troca da própria senha. Exige sessão e a senha atual.
 *
 * O 200 vem com um cookie de sessão NOVO: as outras sessões da pessoa são
 * revogadas, mas quem trocou continua logado. Não redirecione para /entrar.
 */
export function changePassword(input: { currentPassword: string; newPassword: string }) {
  return apiRequest<{ ok: true }>("/api/auth/password", json(input));
}

/**
 * Dados do próprio usuário. Só exige sessão: NÃO é bloqueado em somente
 * leitura, de propósito — o nome e a foto de alguém são dela, não da igreja, e
 * não ficam reféns de uma mensalidade em aberto. Editar os dados da IGREJA é
 * que é bloqueado.
 *
 * `null` remove telefone ou foto. O e-mail não entra: é a identidade de login.
 */
export function updateProfile(changes: { fullName?: string; phone?: string | null; avatarUrl?: string | null }) {
  return apiRequest<{ ok: true }>("/api/auth/profile", { method: "PATCH", body: JSON.stringify(changes) });
}

/** As igrejas da pessoa, com o papel em cada uma. Só exige sessão. */
export function listOrganizations() {
  return apiRequest<{ organizations: MembershipOrganization[]; current: string }>("/api/organizations");
}

/**
 * Cria uma igreja nova para quem já tem uma.
 *
 * ATENÇÃO AO EFEITO: o 201 vem com cookie NOVO e A SESSÃO JÁ É DA IGREJA
 * CRIADA. Quem chama isto está, no instante seguinte, noutra organização —
 * qualquer tela que continue mostrando dado da anterior está mentindo, e toda
 * escrita feita dali cai na igreja nova sem erro nenhum. Avise e recarregue.
 *
 * A igreja nasce no Semente, sem avaliação e sem linha de assinatura: quem já
 * tem igreja aqui já experimentou o produto.
 */
export function createOrganization(input: { organizationName: string; document?: string; email?: string; phone?: string }) {
  return apiRequest<SessionPayload>("/api/organizations", json(input));
}

export function switchOrganization(input: { organizationSlug?: string; organizationId?: string }) {
  return apiRequest<SessionPayload>("/api/auth/switch", json(input));
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
