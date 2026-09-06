"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { PlanPanel } from "@/components/plan-panel";
import { ProfileCard } from "./profile-card";

export default function SettingsPage() {
  return (
    <DashboardShell title="Configurações">
      <main className="settings-main">
        <section className="resource-heading settings-heading">
          <div>
            <h2>Configurações</h2>
            <p>Gerencie o perfil da sua conta e o plano da igreja.</p>
          </div>
        </section>

        <section className="settings-grid">
          <ProfileCard />
          <PlanPanel />
        </section>
      </main>
    </DashboardShell>
  );
}
