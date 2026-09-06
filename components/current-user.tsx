"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSession, type SessionOrganization, type SessionPayload } from "@/components/auth/session";

export type CurrentUser = {
  name: string;
  /** Papel na organização, exibido abaixo do nome. */
  role: string;
  email: string | null;
  phone: string | null;
  /** URL ou data URI da foto. Sem foto, a interface usa as iniciais. */
  avatarUrl: string | null;
};

type SessionState = {
  user: CurrentUser;
  organization: SessionOrganization | null;
  permissions: string[];
  /** A sondagem ainda não voltou — não conclua "deslogado" a partir disto. */
  loading: boolean;
  authenticated: boolean;
};

/**
 * Estado servido enquanto `GET /api/auth/session` não responde. É genérico de
 * propósito: nada de pessoa inventada aparecendo por meio segundo na tela.
 */
export const placeholderUser: CurrentUser = {
  name: "Administrador",
  role: "Conta da igreja",
  email: null,
  phone: null,
  avatarUrl: null,
};

const initialState: SessionState = {
  user: placeholderUser,
  organization: null,
  permissions: [],
  loading: true,
  authenticated: false,
};

const SessionContext = createContext<SessionState>(initialState);

function toState(payload: SessionPayload): SessionState {
  return {
    user: {
      name: payload.user.name,
      role: payload.role.name,
      email: payload.user.email,
      // O telefone não vem no SessionPayload; ele mora na ficha da pessoa e
      // entra quando a tela de perfil for ligada em /api/users.
      phone: null,
      avatarUrl: payload.user.avatarUrl,
    },
    organization: payload.organization,
    permissions: payload.permissions,
    loading: false,
    authenticated: true,
  };
}

export function CurrentUserProvider({
  session,
  children,
}: {
  /** Sessão já resolvida (SSR ou teste). Sem ela, o provider sonda a API. */
  session?: SessionPayload;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<SessionState>(() => (session ? toState(session) : initialState));

  useEffect(() => {
    if (session) return;
    let active = true;

    getSession()
      .then((response) => {
        if (!active) return;
        if (response.authenticated) setState(toState(response));
        else setState({ ...initialState, loading: false });
      })
      // Sem sessão a tela não quebra: o middleware é quem redireciona. Aqui
      // basta não travar em "carregando" para sempre.
      .catch(() => active && setState({ ...initialState, loading: false }));

    return () => {
      active = false;
    };
  }, [session]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

export function useCurrentUser() {
  return useSession().user;
}

/**
 * Permissão no formato `recurso.acao`. Enquanto a sondagem não volta devolve
 * `false`, então o padrão é esconder e depois revelar — nunca o contrário.
 */
export function usePermission(permission: string) {
  const { permissions } = useSession();
  return useMemo(() => permissions.includes(permission), [permissions, permission]);
}
