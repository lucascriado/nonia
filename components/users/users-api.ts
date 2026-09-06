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

/**
 * Altera papel, situação, vínculo com pessoa ou senha. Todos os campos são
 * opcionais e só o que vier é alterado.
 *
 * Efeitos que a tela precisa comunicar: suspender revoga as sessões da pessoa,
 * e redefinir senha também.
 *
 * Cuidado com dois códigos: `insufficient_role_level` e
 * `user_in_multiple_organizations` valem SÓ para redefinição de senha. Tratar
 * como erro genérico do PATCH mostraria mensagem errada em cima de troca de
 * papel.
 */
export function updateUser(
  id: string,
  changes: { roleSlug?: string; status?: "active" | "suspended"; personId?: string; password?: string },
) {
  return apiRequest<{ ok: true }>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(changes) });
}

/** Remove o vínculo com esta igreja; o usuário segue existindo em outras. */
export function removeUser(id: string) {
  return apiRequest<{ ok: true }>(`/api/users/${id}`, { method: "DELETE" });
}
