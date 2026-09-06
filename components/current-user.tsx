"use client";

import { createContext, useContext } from "react";

export type CurrentUser = {
  name: string;
  /** Papel na igreja, exibido abaixo do nome. */
  role: string;
  email: string | null;
  phone: string | null;
  /** URL ou data URI da foto. Sem foto, a interface usa as iniciais. */
  avatarUrl: string | null;
};

/**
 * PONTO ÚNICO dos dados do usuário logado.
 *
 * Enquanto a autenticação não chega, este é o valor servido em toda a
 * interface — de propósito genérico, e não mais uma pessoa inventada
 * espalhada por três arquivos. Quando a sessão existir, o único trabalho é
 * passar o usuário real ao `CurrentUserProvider` do DashboardShell; nenhuma
 * tela precisa mudar.
 */
export const placeholderUser: CurrentUser = {
  name: "Administrador",
  role: "Conta da igreja",
  email: null,
  phone: null,
  avatarUrl: null,
};

const CurrentUserContext = createContext<CurrentUser>(placeholderUser);

export function CurrentUserProvider({
  user = placeholderUser,
  children,
}: {
  user?: CurrentUser;
  children: React.ReactNode;
}) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
  return useContext(CurrentUserContext);
}
