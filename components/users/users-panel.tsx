"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, Lock, MailWarning, ShieldCheck, UserMinus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthField } from "@/components/auth/auth-field";
import { AuthError, emailProblem } from "@/components/auth/session";
import Link from "next/link";
import { usePermission, useReadOnly, useSession } from "@/components/current-user";
import { LoadFailure } from "@/components/load-failure";
import { createInvitation, getRoles, getUsers, removeUser, revokeInvitation, updateUser, type OrganizationUser, type PendingInvitation, type Role } from "@/components/users/users-api";
import { ResetPasswordDialog } from "@/components/users/reset-password-dialog";

const emptyForm = { fullName: "", email: "", roleSlug: "" };

export function UsersPanel() {
  const { user: currentUser, plan } = useSession();
  const podeGerir = usePermission("users.write");
  // Somente leitura vale para convidar, mudar papel, suspender e remover: são
  // escritas na organização, e a rota devolve 402. Antes o formulário inteiro
  // ficava à disposição de quem não podia usá-lo.
  const readOnly = useReadOnly();
  const canInvite = podeGerir && !readOnly;
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  /** Status HTTP da leitura que falhou, ou `null`. Ver LoadFailure. */
  const [failed, setFailed] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof emptyForm, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Link do convite recém-criado. Só existe aqui: nenhuma listagem o devolve. */
  const [freshInvite, setFreshInvite] = useState<PendingInvitation | null>(null);
  const [resetTarget, setResetTarget] = useState<OrganizationUser | null>(null);
  /** Convite aberto em diálogo, como o cadastro das cinco listagens. */
  const [inviting, setInviting] = useState(false);

  const refresh = useMemo(
    () => () => {
      getUsers()
        .then((data) => {
          setUsers(data.users);
          setInvitations(data.invitations);
        })
        .catch(() => toast.error("Não foi possível atualizar a lista."));
    },
    [],
  );

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
      .catch((error) => {
        if (!active) return;
        setFailed(error instanceof AuthError ? error.status : 0);
        toast.error("Não foi possível carregar os usuários.");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  /**
   * Assentos ocupados contra o teto do plano. No Semente é 1, e o dono já o
   * ocupa — ou seja, no gratuito o convite SEMPRE recusa. Melhor explicar que
   * é o plano do que deixar a pessoa preencher o formulário para levar um erro.
   */
  // Convite pendente OCUPA assento: medi na prática — 2 usuários mais 3
  // convites deram usage.users 5 de 5. Quem vê "5 de 5" com dois nomes na tela
  // precisa saber que os convites contam, senão parece erro de contagem.
  const seatsFull = plan?.maxUsers != null && plan.usage.users >= plan.maxUsers;

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
      // Fecha o diálogo: o link do convite aparece no painel atrás dele, e é a
      // única vez que ele existe — ficar escondido sob um modal seria perdê-lo.
      setInviting(false);
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      if (error.code === "email_taken") setErrors((current) => ({ ...current, email: error.message }));
      else if (error.code === "plan_limit_reached") {
        // Pode chegar aqui mesmo com a checagem acima: outra pessoa pode ter
        // ocupado o último assento entre carregar a tela e enviar.
        setFormError(`${error.message} O limite é do plano, não do convite — mude de plano para abrir mais assentos.`);
      } else setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Falhou a leitura: não desenhe a lista vazia com o formulário de convite.
  // Sem os dados, "0 de 5 acessos" e um formulário que vai levar 403 dizem
  // sobre a igreja coisas que ninguém leu.
  if (failed !== null) {
    return <article className="users-panel"><LoadFailure onRetry={() => window.location.reload()} status={failed} /></article>;
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
        {/* `margin-left: auto` no CSS, não `space-between` no cabeçalho: com
            três filhos, o space-between joga o do meio para o centro -- o
            mesmo defeito que o botão de exportar teve nas listagens. */}
        {canInvite && !seatsFull && (
          <button className="primary-action" onClick={() => setInviting(true)} type="button">
            <UserPlus aria-hidden />Convidar
          </button>
        )}
      </header>

      <ul className="users-list">
        {users.map((person) => (
          <UserRow
            canManage={canInvite}
            isSelf={person.email === currentUser.email}
            key={person.id}
            onChanged={refresh}
            onResetPassword={() => setResetTarget(person)}
            roles={roles}
            user={person}
          />
        ))}

        {invitations.map((invitation) => (
          <InvitationRow
            canManage={canInvite}
            invitation={invitation}
            key={invitation.id}
            // Cancelar o convite tem que levar o link junto: ele fica na tela
            // depois de criado, e um link revogado que continua copiável manda
            // a pessoa repassar um endereço que já não abre nada.
            onChanged={() => { if (invitation.id === freshInvite?.id) setFreshInvite(null); refresh(); }}
            roleName={roles.find((role) => role.slug === invitation.roleSlug)?.name ?? invitation.roleSlug}
          />
        ))}
      </ul>

      {freshInvite?.inviteUrl && <InviteLink invitation={freshInvite} onDone={() => setFreshInvite(null)} />}

      {canInvite && !freshInvite && seatsFull && (
        <div className="users-seats-full">
          <p>
            <ShieldCheck aria-hidden />
            <span>
              O plano <strong>{plan!.name}</strong> inclui{" "}
              {plan!.maxUsers === 1 ? "um acesso" : `${plan!.maxUsers} acessos`}, e todos já estão
              ocupados{invitations.length > 0 ? " — convite pendente também ocupa um acesso, então cancelar um que não vai ser aceito libera espaço" : ""}.
              Para convidar mais gente, mude de plano: o convite seria recusado por limite, não por
              erro seu.
            </span>
          </p>
          <Link className="primary-action" href="/configuracoes">Ver planos</Link>
        </div>
      )}

      {/* Sozinha na igreja: uma frase e um caminho, como o estado de primeira
          vez das listagens. Uma linha só na lista, com o formulário inteiro
          embaixo, era a tela cheia com dado vazio. */}
      {users.length === 1 && invitations.length === 0 && !freshInvite && (
        <p className="users-solo">
          Você é a única pessoa com acesso a esta igreja.
          {canInvite && !seatsFull && " Convide quem ajuda na administração para dividir o trabalho."}
        </p>
      )}

      {readOnly && podeGerir && (
        <p className="users-readonly">
          <Lock aria-hidden />
          <span>Convidar, mudar papel, suspender e remover ficam indisponíveis enquanto a conta estiver em somente leitura. Regularize a mensalidade para voltar a gerir os acessos.</span>
        </p>
      )}

      {inviting && (
        <div className="form-dialog-layer" onPointerDown={(event) => !submitting && event.currentTarget === event.target && setInviting(false)}>
          <section aria-labelledby="convidar-titulo" aria-modal="true" className="form-dialog" role="dialog">
            <form className="users-invite" noValidate onSubmit={handleSubmit}>
              <div className="form-dialog-body">
                <h2 id="convidar-titulo">Convidar alguém</h2>
                <p>O convite vira um link que você mesmo repassa: o nonia ainda não envia e-mail.</p>

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

              </div>
              <footer>
                <button disabled={submitting} onClick={() => setInviting(false)} type="button">Cancelar</button>
                <button className="primary-action" disabled={submitting} type="submit">
                  {submitting ? <><LoaderCircle className="button-spinner" aria-hidden /> Gerando convite…</> : <><UserPlus aria-hidden />Gerar convite</>}
                </button>
              </footer>
                    </form>
          </section>
        </div>
      )}

      {resetTarget && <ResetPasswordDialog onClose={() => setResetTarget(null)} user={resetTarget} />}
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

/**
 * Uma pessoa da lista, com as ações de papel e remoção.
 *
 * As ações NÃO são escondidas para proprietário. O bloqueio do servidor é
 * `last_owner` e só dispara quando a organização ficaria sem nenhum
 * proprietário ativo — com dois donos, rebaixar um é legítimo. Esconder aqui
 * seria esconder ação permitida; a API recusa quando for o caso e a tela mostra
 * a mensagem dela.
 *
 * Sobre si mesmo é diferente: `self_update` e `self_delete` são sempre 403, e
 * aí esconder é o certo.
 */
function UserRow({
  user,
  roles,
  isSelf,
  canManage,
  onChanged,
  onResetPassword,
}: {
  user: OrganizationUser;
  roles: Role[];
  isSelf: boolean;
  canManage: boolean;
  onChanged: () => void;
  onResetPassword: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const suspended = user.status === "suspended";

  async function run(action: () => Promise<unknown>, ok: string) {
    setWorking(true);
    try {
      await action();
      toast.success(ok);
      onChanged();
    } catch (error) {
      toast.error(error instanceof AuthError ? error.message : "Não foi possível concluir a operação.");
    } finally {
      setWorking(false);
      setConfirmingRemoval(false);
    }
  }

  return (
    <li className={suspended ? "is-suspended" : undefined}>
      {/* 36 e não 38: é a mesma largura do ícone do cabeçalho do painel, então
          o nome da pessoa cai exatamente sob o título "Quem tem acesso". Com 38
          a coluna de texto ficava 2px à direita da de cima. */}
      <Avatar name={user.name} photoUrl={user.avatarUrl} size={36} />
      <span className="users-identity">
        <strong>
          {user.name}
          {isSelf && <em>você</em>}
          {suspended && <em className="is-suspended-tag">suspenso</em>}
        </strong>
        <small>{user.email}</small>
      </span>

      {canManage && !isSelf ? (
        <span className="users-actions">
          <label className="mk-visually-hidden" htmlFor={`papel-${user.id}`}>Papel de {user.name}</label>
          <select
            disabled={working}
            id={`papel-${user.id}`}
            onChange={(event) => run(() => updateUser(user.id, { roleSlug: event.target.value }), `${user.name} agora é ${roles.find((r) => r.slug === event.target.value)?.name ?? "atualizado"}.`)}
            value={user.roleSlug}
          >
            {/* O papel atual entra na lista mesmo sendo proprietário, senão o
                select abriria mostrando outra coisa que não a verdade. */}
            {!roles.some((role) => role.slug === user.roleSlug) && <option value={user.roleSlug}>{user.roleName}</option>}
            {roles.map((role) => <option key={role.slug} value={role.slug}>{role.name}</option>)}
          </select>

          <button
            disabled={working}
            onClick={() =>
              run(
                () => updateUser(user.id, { status: suspended ? "active" : "suspended" }),
                suspended ? `${user.name} voltou a ter acesso.` : `${user.name} foi suspenso e as sessões dele foram encerradas.`,
              )
            }
            title={suspended ? "Devolver o acesso" : "Suspender o acesso e encerrar as sessões"}
            type="button"
          >
            {suspended ? "Reativar" : "Suspender"}
          </button>

          {/* Sem recuperação por e-mail, redefinir aqui é a única saída de quem
              perdeu a senha. Não fica escondido atrás de menu. */}
          <button
            aria-label={`Redefinir a senha de ${user.name}`}
            className="users-reset"
            disabled={working}
            onClick={onResetPassword}
            title="Redefinir a senha desta pessoa"
            type="button"
          >
            <KeyRound aria-hidden />
          </button>

          {confirmingRemoval ? (
            <span className="users-confirm">
              <button disabled={working} onClick={() => setConfirmingRemoval(false)} type="button">Voltar</button>
              <button
                className="users-remove-confirm"
                disabled={working}
                onClick={() => run(() => removeUser(user.id), `${user.name} não tem mais acesso a esta igreja.`)}
                type="button"
              >
                Remover
              </button>
            </span>
          ) : (
            <button
              aria-label={`Remover ${user.name} desta igreja`}
              className="users-remove"
              disabled={working}
              onClick={() => setConfirmingRemoval(true)}
              type="button"
            >
              <UserMinus aria-hidden />
            </button>
          )}
        </span>
      ) : (
        <span className="users-role">{user.roleName}</span>
      )}
    </li>
  );
}

/**
 * Convite pendente.
 *
 * Revogar existe por um motivo prático: convite pendente OCUPA acesso, e no
 * plano gratuito há um só. Um e-mail digitado errado travaria a igreja inteira
 * até alguém mexer no banco.
 */
function InvitationRow({
  invitation,
  roleName,
  canManage,
  onChanged,
}: {
  invitation: PendingInvitation;
  roleName: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function revoke() {
    setWorking(true);
    try {
      await revokeInvitation(invitation.id);
      toast.success(`Convite de ${invitation.email} cancelado. O acesso voltou para o plano.`);
      onChanged();
    } catch (error) {
      if (error instanceof AuthError && error.code === "invitation_not_pending") {
        // O convite foi aceito entre carregar a tela e clicar: a pessoa já é
        // usuária, e o que some é o convite, não o acesso dela.
        toast.info(`${invitation.email} já aceitou o convite — agora é usuário desta igreja.`);
        onChanged();
      } else {
        toast.error(error instanceof AuthError ? error.message : "Não foi possível cancelar o convite.");
      }
    } finally {
      setWorking(false);
      setConfirming(false);
    }
  }

  return (
    <li className="is-pending">
      <Avatar name={invitation.name ?? invitation.email} size={38} />
      <span className="users-identity">
        <strong>{invitation.name ?? invitation.email}</strong>
        <small>{invitation.email} · convite pendente, ocupando um acesso</small>
      </span>

      {canManage ? (
        <span className="users-actions">
          <span className="users-role">{roleName}</span>
          {confirming ? (
            <span className="users-confirm">
              <button disabled={working} onClick={() => setConfirming(false)} type="button">Voltar</button>
              <button className="users-remove-confirm" disabled={working} onClick={revoke} type="button">Cancelar convite</button>
            </span>
          ) : (
            <button
              aria-label={`Cancelar o convite de ${invitation.email}`}
              className="users-remove"
              disabled={working}
              onClick={() => setConfirming(true)}
              title="Cancelar o convite e liberar o acesso"
              type="button"
            >
              <X aria-hidden />
            </button>
          )}
        </span>
      ) : (
        <span className="users-role">{roleName}</span>
      )}
    </li>
  );
}
