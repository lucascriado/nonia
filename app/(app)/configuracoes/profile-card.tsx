"use client";

import { Mail, Phone } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { useCurrentUser } from "@/components/current-user";

/**
 * Componente à parte de propósito: o provider de sessão vive DENTRO do
 * DashboardShell, então um hook chamado no componente de página — que é quem
 * renderiza o shell — leria o valor padrão do contexto, não a sessão. Aqui o
 * hook roda abaixo do provider.
 */
export function ProfileCard() {
  const user = useCurrentUser();

  return (
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
      <ChangePasswordForm />
    </article>
  );
}
