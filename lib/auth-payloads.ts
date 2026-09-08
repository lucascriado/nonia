import type { AuthContext } from "@/lib/auth";

/** Formato único de sessão devolvido por login, cadastro e /api/auth/session. */
export function sessionPayload(auth: AuthContext) {
  return {
    authenticated: true as const,
    user: {
      id: auth.user.id,
      name: auth.user.fullName,
      email: auth.user.email,
      phone: auth.user.phone,
      avatarUrl: auth.user.avatarUrl,
      personId: auth.personId,
    },
    organization: {
      id: auth.organization.id,
      name: auth.organization.name,
      slug: auth.organization.slug,
      // O FUSO VAI PARA O CLIENTE porque "hoje" é calculado em formulário, no
      // navegador. Sem ele, a tela cairia no fuso da máquina de quem digita --
      // que por acaso acerta em Brasília e erra em qualquer outro lugar, e é
      // justamente o tipo de defeito que só aparece longe de quem testou.
      timezone: auth.organization.timezone,
    },
    role: auth.role,
    permissions: [...auth.permissions].sort(),
    expiresAt: auth.expiresAt.toISOString(),
  };
}

export type SessionPayload = ReturnType<typeof sessionPayload>;
