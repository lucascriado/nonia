"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { UsersPanel } from "@/components/users/users-panel";

export default function UsersPage() {
  return (
    <DashboardShell title="Usuários">
      <main className="settings-main">
        {/* O título desta tela vive na BARRA DO TOPO, e só lá. Aqui havia um
            segundo <h2> dizendo a mesma coisa com palavras um pouco
            diferentes -- que é pior que repetir igual, porque a diferença faz
            procurar um sentido que não existe. Decisão do Lucas: fica o de
            cima. Ver components/header.tsx, que monta título e legenda a
            partir de `searchItems`. */}
        <UsersPanel />
      </main>
    </DashboardShell>
  );
}
