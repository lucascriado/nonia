"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, LoaderCircle, MailWarning, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthField } from "@/components/auth/auth-field";
import { AuthError, emailProblem } from "@/components/auth/session";
import { usePermission, useSession } from "@/components/current-user";
import { createInvitation, getRoles, getUsers, type OrganizationUser, type PendingInvitation, type Role } from "@/components/users/users-api";

const emptyForm = { fullName: "", email: "", roleSlug: "" };

export function UsersPanel() {
  const { user: currentUser } = useSession();
  const canInvite = usePermission("users.write");
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof emptyForm, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Link do convite recém-criado. Só existe aqui: nenhuma listagem o devolve. */
  const [freshInvite, setFreshInvite] = useState<PendingInvitation | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getUsers(), getRoles()])
      .then(([data, roleList]) => {
        if (!active) return;
        setUsers(data.users);
        setInvitations(data.invitations);
        // O proprietário não é atribuível: quem convida não cria outro dono.
        setRoles(roleList.filter((role) => role.slug !== "owner"));
      })
      .catch(() => active && toast.error("Não foi possível carregar os usuários."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const defaultRole = useMemo(() => roles.find((role) => role.slug === "secretaria")?.slug ?? roles[0]?.slug ?? "", [roles]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const roleSlug = form.roleSlug || defaultRole;
    const problems = {
      fullName: form.fullName.trim() ? undefined : "Informe o nome de quem você está convidando.",
      email: emailProblem(form.email) ?? undefined,
      roleSlug: roleSlug ? undefined : "Escolha o papel.",
    };
    setErrors(problems);
    setFormError(null);
    if (Object.values(problems).some(Boolean)) return;

    setSubmitting(true);
    try {
      const invitation = await createInvitation({ fullName: form.fullName.trim(), email: form.email.trim(), roleSlug });
      setInvitations((current) => [...current, invitation]);
      setFreshInvite(invitation);
      setForm(emptyForm);
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      if (error.code === "email_taken") setErrors((current) => ({ ...current, email: error.message }));
      else setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <article className="users-panel is-loading" aria-busy="true">
        <LoaderCircle className="button-spinner" aria-hidden />
        <p>Carregando usuários…</p>
      </article>
    );
  }

  return (
    <article className="users-panel">
      <header>
        <span aria-hidden><ShieldCheck /></span>
        <div>
          <h3>Quem tem acesso</h3>
          <p>Convide a secretaria, os líderes e quem mais ajuda na administração.</p>
        </div>
      </header>

      <ul className="users-list">
        {users.map((person) => (
          <li key={person.id}>
            <Avatar name={person.name} photoUrl={person.avatarUrl} size={38} />
            <span className="users-identity">
              <strong>
                {person.name}
                {person.email === currentUser.email && <em>você</em>}
              </strong>
              <small>{person.email}</small>
            </span>
            <span className="users-role">{person.roleName}</span>
          </li>
        ))}

        {invitations.map((invitation) => (
          <li className="is-pending" key={invitation.id}>
            <Avatar name={invitation.name ?? invitation.email} size={38} />
            <span className="users-identity">
              <strong>{invitation.name ?? invitation.email}</strong>
              <small>{invitation.email} · convite pendente</small>
            </span>
            <span className="users-role">{roles.find((role) => role.slug === invitation.roleSlug)?.name ?? invitation.roleSlug}</span>
          </li>
        ))}
      </ul>

      {freshInvite?.inviteUrl && <InviteLink invitation={freshInvite} onDone={() => setFreshInvite(null)} />}

      {canInvite && !freshInvite && (
        <form className="users-invite" noValidate onSubmit={handleSubmit}>
          <h4><UserPlus aria-hidden />Convidar alguém</h4>

          <AuthAlert message={formError} />

          <AuthField
            error={errors.fullName}
            label="Nome"
            onChange={(event) => setForm((c) => ({ ...c, fullName: event.target.value }))}
            placeholder="Nome e sobrenome"
            value={form.fullName}
          />

          <AuthField
            error={errors.email}
            inputMode="email"
            label="E-mail"
            onChange={(event) => setForm((c) => ({ ...c, email: event.target.value }))}
            placeholder="pessoa@suaigreja.com.br"
            type="email"
            value={form.email}
          />

          <div className="mk-field">
            <label htmlFor="convite-papel">Papel</label>
            <select
              id="convite-papel"
              onChange={(event) => setForm((c) => ({ ...c, roleSlug: event.target.value }))}
              value={form.roleSlug || defaultRole}
            >
              {roles.map((role) => <option key={role.slug} value={role.slug}>{role.name}</option>)}
            </select>
            <small>{roles.find((role) => role.slug === (form.roleSlug || defaultRole))?.description}</small>
          </div>

          <button className="primary-action" disabled={submitting} type="submit">
            {submitting ? <><LoaderCircle className="button-spinner" aria-hidden /> Gerando convite…</> : <><UserPlus aria-hidden />Gerar convite</>}
          </button>
        </form>
      )}
    </article>
  );
}

/**
 * O link do convite, logo depois de criado.
 *
 * Não há envio de e-mail no produto, então quem convidou precisa repassar este
 * endereço à mão. Ele NÃO volta em nenhuma listagem depois — sair desta tela
 * sem copiar significa gerar outro convite.
 */
function InviteLink({ invitation, onDone }: { invitation: PendingInvitation; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(invitation.inviteUrl!);
      setCopied(true);
      toast.success("Link copiado.");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard bloqueado (sem HTTPS, permissão negada): o link está à vista
      // e pode ser copiado à mão, então isto não é um beco sem saída.
      toast.error("Não consegui copiar. Selecione o link e copie manualmente.");
    }
  }

  return (
    <div className="invite-link">
      {/* O texto vai dentro de um <span> porque o aviso é um flex container: solto,
          cada trecho em negrito viraria uma COLUNA e a frase deixaria de fluir. */}
      <p className="invite-link-warning">
        <MailWarning aria-hidden />
        <span>
          O nonia ainda não envia e-mail. <strong>Copie o link abaixo e mande para {invitation.name ?? invitation.email}</strong>{" "}
          pelo WhatsApp ou como preferir — ele não aparece de novo depois que você sair daqui.
        </span>
      </p>

      <div className="invite-link-row">
        <input aria-label="Link do convite" onFocus={(event) => event.target.select()} readOnly value={invitation.inviteUrl} />
        <button className="primary-action" onClick={copy} type="button">
          {copied ? <><Check aria-hidden />Copiado</> : <><Copy aria-hidden />Copiar</>}
        </button>
      </div>

      <p className="invite-link-note">
        O convite vale até {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(invitation.expiresAt))}.
      </p>

      <button className="invite-link-done" onClick={onDone} type="button">Já copiei, convidar outra pessoa</button>
    </div>
  );
}
