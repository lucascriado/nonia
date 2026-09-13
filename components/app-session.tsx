"use client";

import { usePathname } from "next/navigation";
import { CurrentUserProvider } from "@/components/current-user";
import { isAppPage } from "@/lib/rotas";

/**
 * Liga o provider de sessão só nas telas do sistema, a partir do layout raiz.
 *
 * O provider precisa ficar ACIMA de toda página do app, e não dentro do
 * DashboardShell. Enquanto ele morava no shell, qualquer hook de sessão
 * chamado no componente de página lia o valor padrão do contexto — porque a
 * página é quem renderiza o shell, ou seja, está ACIMA do provider. Isso já
 * causou dois defeitos: o cartão de perfil mostrando o placeholder com a
 * topbar mostrando o usuário real, e os botões de cadastrar sem reagir ao modo
 * somente leitura.
 *
 * Por que decidir pelo caminho, e não num layout.tsx por rota:
 *
 * - entre telas do sistema o provider continua montado, então navegar pelo
 *   menu não sonda a sessão de novo nem pisca o placeholder a cada clique;
 * - vindo do site público (depois do login, que navega com router.replace) o
 *   ramo muda, o provider monta do zero e sonda a sessão que acabou de nascer.
 *   Com o provider sempre ligado no layout raiz, ele guardaria o "deslogado"
 *   lido em /entrar e o app abriria sem usuário.
 */
export function AppSession({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!isAppPage(pathname)) return children;
  return <CurrentUserProvider>{children}</CurrentUserProvider>;
}
