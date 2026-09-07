"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { UsersPanel } from "@/components/users/users-panel";

export default function UsersPage() {
  return (
    <DashboardShell title="Usuários">
      <main className="settings-main">
        <section className="resource-heading settings-heading">
          <div>
            <h2>Usuários</h2>
            <p>Quem tem acesso ao painel da igreja e com qual papel.</p>
          </div>
        </section>

        <UsersPanel />
      </main>
    </DashboardShell>
  );
}
