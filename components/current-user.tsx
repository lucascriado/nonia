"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSession, type SessionOrganization, type SessionPayload, type SessionPlan } from "@/components/auth/session";

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
  /** Todas as igrejas da pessoa. Com uma só, o seletor não aparece. */
  organizations: SessionOrganization[];
  permissions: string[];
  /** Só chega pelo GET sessão; ausente enquanto a sondagem não volta. */
  plan: SessionPlan | null;
  /** A sondagem ainda não voltou — não conclua "deslogado" a partir disto. */
  loading: boolean;
  authenticated: boolean;
  /** Re-sonda a sessão. Usado depois de editar o próprio perfil. */
  refresh: () => void;
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
  organizations: [],
  permissions: [],
  plan: null,
  loading: true,
  authenticated: false,
  refresh: () => {},
};

const SessionContext = createContext<SessionState>(initialState);

function toState(payload: SessionPayload): SessionState {
  return {
    user: {
      name: payload.user.name,
      role: payload.role.name,
      email: payload.user.email,
      phone: payload.user.phone,
      avatarUrl: payload.user.avatarUrl,
    },
    organization: payload.organization,
    organizations: payload.organizations ?? [],
    permissions: payload.permissions,
    plan: payload.plan ?? null,
    loading: false,
    authenticated: true,
    refresh: () => {},
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

  const load = useCallback(() => {
    getSession()
      .then((response) => {
        if (response.authenticated) setState({ ...toState(response), refresh: load });
        else setState({ ...initialState, loading: false, refresh: load });
      })
      // Sem sessão a tela não quebra: o proxy é quem redireciona. Aqui basta
      // não travar em "carregando" para sempre.
      .catch(() => setState({ ...initialState, loading: false, refresh: load }));
  }, []);

  useEffect(() => {
    if (session) {
      setState({ ...toState(session), refresh: load });
      return;
    }
    load();
  }, [session, load]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

export function useCurrentUser() {
  return useSession().user;
}

/**
 * A igreja está em somente leitura por mensalidade em aberto: consultar,
 * buscar e exportar seguem valendo; cadastrar e editar param.
 *
 * A tela usa isto para NÃO oferecer o que o servidor vai recusar — sem isso a
 * pessoa preenche um cadastro inteiro para descobrir no salvar.
 */
/**
 * O motivo, escrito uma vez só. Ele aparece em toda ação de escrita bloqueada
 * por mensalidade -- criar, editar, excluir, converter -- em seis telas. Solto
 * em cada arquivo, ele já teria divergido: metade diria "cadastrar" e a outra
 * metade "editar", e a pessoa leria mensagens diferentes para o mesmo estado.
 */
export const READ_ONLY_REASON =
  "A conta está em somente leitura por mensalidade em aberto. Regularize para voltar a cadastrar e editar.";

export function useReadOnly() {
  return useSession().plan?.access.level === "read_only";
}

/**
 * Permissão no formato `recurso.acao`. Enquanto a sondagem não volta devolve
 * `false`, então o padrão é esconder e depois revelar — nunca o contrário.
 */
export function usePermission(permission: string) {
  const { permissions } = useSession();
  return useMemo(() => permissions.includes(permission), [permissions, permission]);
}
