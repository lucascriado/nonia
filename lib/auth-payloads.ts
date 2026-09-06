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
    },
    role: auth.role,
    permissions: [...auth.permissions].sort(),
    expiresAt: auth.expiresAt.toISOString(),
  };
}

export type SessionPayload = ReturnType<typeof sessionPayload>;
