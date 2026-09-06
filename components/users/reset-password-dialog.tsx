"use client";

import { useState } from "react";
import { KeyRound, LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthField } from "@/components/auth/auth-field";
import { AuthError, passwordProblem } from "@/components/auth/session";
import { updateUser, type OrganizationUser } from "@/components/users/users-api";

/**
 * Redefinição da senha de OUTRA pessoa.
 *
 * Sem recuperação por e-mail no produto, esta é a única saída de quem perdeu a
 * senha. Por isso a tela é escrita para não deixar quem clica com a impressão
 * de ter quebrado a conta de alguém: cada recusa explica de quem é a condição
 * e o que fazer a seguir.
 */
export function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: OrganizationUser;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const problem = passwordProblem(password);
    if (problem) return setFieldError(problem);
    if (password !== confirm) return setFieldError("A confirmação não confere com a nova senha.");

    setFieldError(null);
    setFormError(null);
    setSaving(true);
    try {
      await updateUser(user.id, { password });
      toast.success(`Senha de ${user.name} redefinida. Passe a nova senha para a pessoa.`);
      onClose();
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;

      if (error.code === "weak_password") setFieldError(error.message);
      else if (error.code === "self_password_reset") {
        // Para si mesmo o caminho existe e é outro: a troca com senha atual,
        // no cartão de perfil. Recusar sem apontar deixaria a pessoa sem saída.
        setFormError("Para trocar a SUA senha, use “Alterar senha” no seu perfil, em Configurações — lá a troca pede a senha atual.");
        setBlocked(true);
      } else if (error.code === "user_in_multiple_organizations") {
        // Não é falha da ação: é uma condição da pessoa. A senha pertence à
        // identidade dela, que serve a mais de uma igreja, e por isso não pode
        // ser trocada por um responsável de uma delas.
        setFormError(
          `${user.name} também acessa outra igreja no nonia. A senha pertence à conta dela, não ao vínculo com esta igreja, então ninguém daqui pode redefinir. Ela precisa entrar com a senha que já usa.`,
        );
        setBlocked(true);
      } else if (error.code === "insufficient_role_level") {
        setFormError(`${error.message} Quem pode redefinir a senha de ${user.name} é alguém com papel acima do dela.`);
        setBlocked(true);
      } else setFormError(error.message);

      setSaving(false);
    }
  }

  return (
    <div aria-label={`Redefinir a senha de ${user.name}`} aria-modal className="reset-password-layer" role="dialog">
      <form className="reset-password-card" noValidate onSubmit={submit}>
        <header>
          <span aria-hidden><KeyRound /></span>
          <div>
            <h3>Redefinir a senha de {user.name}</h3>
            <p>{user.email}</p>
          </div>
        </header>

        <AuthAlert message={formError} />

        {!blocked && (
          <>
            {/* O aviso vem ANTES de confirmar, não depois: a pessoa vai ser
                desconectada de onde estiver, e quem clica precisa saber disso
                enquanto ainda dá para voltar atrás. */}
            <p className="reset-password-warning">
              <TriangleAlert aria-hidden />
              <span>
                Ao redefinir, <strong>todas as sessões de {user.name} são encerradas</strong> e ela
                é desconectada de onde estiver. Não enviamos a senha por e-mail —{" "}
                <strong>você precisa passar a nova senha para ela</strong>.
              </span>
            </p>

            <AuthField
              autoComplete="new-password"
              autoFocus
              error={fieldError}
              hint="Pelo menos 8 caracteres, misturando letras e números."
              label="Nova senha"
              onChange={(event) => { setPassword(event.target.value); setFieldError(null); }}
              type="password"
              value={password}
            />

            <AuthField
              autoComplete="new-password"
              label="Repita a nova senha"
              onChange={(event) => { setConfirm(event.target.value); setFieldError(null); }}
              type="password"
              value={confirm}
            />
          </>
        )}

        <footer>
          <button disabled={saving} onClick={onClose} type="button">{blocked ? "Fechar" : "Cancelar"}</button>
          {!blocked && (
            <button className="primary-action" disabled={saving} type="submit">
              {saving ? <><LoaderCircle className="button-spinner" aria-hidden /> Redefinindo…</> : "Redefinir e encerrar sessões"}
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}
