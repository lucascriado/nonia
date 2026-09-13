"use client";

import { CurrentUserProvider } from "@/components/current-user";

/**
 * O provider de sessão vive AQUI, e não dentro do DashboardShell.
 *
 * Enquanto ele morava no shell, qualquer hook de sessão chamado no componente
 * de página lia o valor padrão do contexto — porque a página é quem renderiza
 * o shell, ou seja, está ACIMA do provider. Isso já causou dois defeitos: o
 * cartão de perfil mostrando o placeholder com a topbar mostrando o usuário
 * real, e os botões de cadastrar sem reagir ao modo somente leitura.
 *
 * No layout do grupo, o provider fica acima de toda página do app e o hook
 * funciona onde quer que seja chamado.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <CurrentUserProvider>{children}</CurrentUserProvider>;
}
