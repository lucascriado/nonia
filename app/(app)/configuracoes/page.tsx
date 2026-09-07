"use client";

import { Building2, KeyRound, UserCog } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { OrganizationPanel } from "@/components/organization-panel";
import { PlanPanel } from "@/components/plan-panel";
import { ProfileCard } from "./profile-card";

/**
 * Dois grupos, e a divisão não é estética: é de DONO.
 *
 * "Sua conta" é da pessoa e viaja com ela — trocar de igreja não muda nome,
 * telefone nem senha, e a guarda de somente leitura não alcança nada aqui, de
 * propósito: a inadimplência da igreja não pode chegar ao nome de alguém.
 * "A igreja" é do tenant: passa por permissão e passa pela guarda.
 *
 * Antes eram três cartões soltos numa coluna de 720px, e quem não tem
 * permissão de administrar a igreja descobria isso pela AUSÊNCIA de um cartão
 * no meio de outros. Com o grupo nomeado, o que resta na tela continua dizendo
 * de quem é.
 */
export default function SettingsPage() {
  return (
    <DashboardShell title="Configurações">
      <main className="settings-main">
        <section className="resource-heading settings-heading">
          <div>
            <h2>Configurações</h2>
            <p>O que é seu e o que é da igreja, separados.</p>
          </div>
        </section>

        <section aria-labelledby="grupo-conta" className="settings-group">
          <header>
            <span aria-hidden><UserCog /></span>
            <div>
              <h3 id="grupo-conta">Sua conta</h3>
              <p>Seus dados e sua senha. Não mudam quando você troca de igreja.</p>
            </div>
          </header>
          <div className="settings-row">
            <ProfileCard />
            <article className="settings-card">
              <header>
                <span aria-hidden><KeyRound /></span>
                <div>
                  <h4>Senha</h4>
                  <p>Trocar exige a senha atual. As outras sessões são encerradas; a sua continua.</p>
                </div>
              </header>
              <div className="settings-card-body"><ChangePasswordForm /></div>
            </article>
          </div>
        </section>

        <section aria-labelledby="grupo-igreja" className="settings-group">
          <header>
            <span aria-hidden><Building2 /></span>
            <div>
              <h3 id="grupo-igreja">A igreja</h3>
              <p>Cadastro e plano. Editar depende do seu papel aqui.</p>
            </div>
          </header>
          <div className="settings-row">
            <OrganizationPanel />
            <PlanPanel />
          </div>
        </section>
      </main>
    </DashboardShell>
  );
}
