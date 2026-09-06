import { apiRequest } from "@/components/auth/session";

export type OrganizationUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: string;
  lastLoginAt: string | null;
  personId: string | null;
  roleSlug: string;
  roleName: string;
  joinedAt: string;
};

export type PendingInvitation = {
  id: string;
  email: string;
  name: string | null;
  roleSlug: string;
  status: string;
  expiresAt: string;
  /** Só volta na criação — ver o comentário em `createInvitation`. */
  inviteUrl?: string;
};

export type Role = {
  id: string;
  slug: string;
  name: string;
  description: string;
  level: number;
  permissions: string[];
};

export function getUsers() {
  return apiRequest<{ users: OrganizationUser[]; invitations: PendingInvitation[] }>("/api/users");
}

export function getRoles() {
  return apiRequest<Role[]>("/api/roles");
}

/**
 * Cria o convite. Sem senha no corpo, a resposta traz `inviteUrl`.
 *
 * Não há envio de e-mail no produto: este link é a ÚNICA forma de o convidado
 * receber o convite, e ele só existe nesta resposta — não volta em nenhuma
 * listagem depois. Por isso a tela precisa mostrá-lo na hora e deixar copiar.
 */
export function createInvitation(input: { fullName: string; email: string; roleSlug: string }) {
  return apiRequest<PendingInvitation>("/api/users", { method: "POST", body: JSON.stringify(input) });
}
