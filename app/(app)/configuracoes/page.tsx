"use client";

import { Mail, Phone } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Avatar } from "@/components/avatar";
import { useCurrentUser } from "@/components/current-user";

export default function SettingsPage() {
  const user = useCurrentUser();

  return (
    <DashboardShell title="Configurações">
      <main className="settings-main">
        <section className="resource-heading settings-heading">
          <div>
            <h2>Configurações</h2>
            <p>Gerencie o perfil da sua conta.</p>
          </div>
        </section>

        <section className="settings-grid">
          <article className="profile-card">
            <div className="profile-cover" />
            <Avatar name={user.name} photoUrl={user.avatarUrl} size={96} className="profile-avatar" />
            <h3>{user.name}</h3>
            <small>{user.role}</small>
            <div className="profile-info">
              <span><Mail />E-mail cadastrado</span>
              <strong className={user.email ? undefined : "profile-info-empty"}>{user.email ?? "Não informado"}</strong>
            </div>
            <div className="profile-info">
              <span><Phone />Telefone</span>
              <strong className={user.phone ? undefined : "profile-info-empty"}>{user.phone ?? "Não informado"}</strong>
            </div>
            <button type="button">Editar informações básicas</button>
          </article>
        </section>
      </main>
    </DashboardShell>
  );
}
