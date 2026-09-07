"use client";

import { useState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthField } from "@/components/auth/auth-field";
import { AuthError, changePassword, passwordProblem } from "@/components/auth/session";

const empty = { currentPassword: "", newPassword: "", confirmPassword: "" };

/**
 * Troca da própria senha, no cartão de Segurança.
 *
 * O formulário fica ABERTO, sem botão que o revele. Ele morava dentro do
 * cartão de perfil, onde um formulário de três campos aparecendo do nada seria
 * intrusão; num cartão que existe só para isso, esconder atrás de um clique
 * deixava o cartão com um título, uma frase e nada mais -- oco ao lado de um
 * cartão de perfil cheio.
 *
 * Não há "esqueci minha senha": recuperação por e-mail não existe no produto,
 * então a tela não oferece uma saída que não leva a lugar nenhum. Quem perde a
 * senha depende de um owner redefinir.
 */
export function ChangePasswordForm() {
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof empty, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof typeof empty, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    // A confirmação é só daqui: o backend não a recebe, ela existe para a
    // pessoa não trocar a senha por um erro de digitação que ela não veria.
    const problems = {
      currentPassword: values.currentPassword ? undefined : "Informe a senha atual.",
      newPassword: passwordProblem(values.newPassword) ?? undefined,
      confirmPassword:
        values.confirmPassword === values.newPassword ? undefined : "A confirmação não confere com a nova senha.",
    };
    setErrors(problems);
    setFormError(null);
    if (Object.values(problems).some(Boolean)) return;

    setSubmitting(true);
    try {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });

      // O 200 traz um cookie de sessão novo: quem trocou segue logado, e só as
      // OUTRAS sessões caem. Por isso não há redirecionamento aqui.
      toast.success("Senha alterada. Suas outras sessões foram encerradas.");
      setValues(empty);
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;

      if (error.code === "invalid_credentials") setErrors((current) => ({ ...current, currentPassword: "Senha atual incorreta." }));
      else if (error.code === "weak_password") setErrors((current) => ({ ...current, newPassword: error.message }));
      else if (error.code === "too_many_attempts") {
        // O contador é o mesmo do login: errar aqui tranca entrar também, e
        // sem dizer isso a pessoa acha que perdeu a conta.
        setFormError(
          "Muitas tentativas com a senha atual. Por segurança o acesso fica bloqueado por 15 minutos, e isso vale também para entrar de novo. Tente mais tarde.",
        );
      } else setFormError(error.message);

      setSubmitting(false);
      return;
    }

    setSubmitting(false);
  }

  return (
    <form className="profile-password-form" noValidate onSubmit={handleSubmit}>
      <AuthAlert message={formError} />

      <AuthField
        autoComplete="current-password"
        autoFocus
        error={errors.currentPassword}
        label="Senha atual"
        onChange={(event) => update("currentPassword", event.target.value)}
        type="password"
        value={values.currentPassword}
      />

      <AuthField
        autoComplete="new-password"
        error={errors.newPassword}
        hint="Pelo menos 8 caracteres, misturando letras e números."
        label="Nova senha"
        onChange={(event) => update("newPassword", event.target.value)}
        type="password"
        value={values.newPassword}
      />

      <AuthField
        autoComplete="new-password"
        error={errors.confirmPassword}
        label="Repita a nova senha"
        onChange={(event) => update("confirmPassword", event.target.value)}
        type="password"
        value={values.confirmPassword}
      />

      <div className="profile-password-actions">
        {/* Limpa em vez de fechar: o formulário não abre nem fecha mais, e
            "Cancelar" sem nada para cancelar seria botão que não faz nada. */}
        <button
          disabled={submitting || !(values.currentPassword || values.newPassword || values.confirmPassword)}
          onClick={() => { setValues(empty); setErrors({}); setFormError(null); }}
          type="button"
        >
          Limpar
        </button>
        <button className="primary-action" disabled={submitting} type="submit">
          {submitting ? <><LoaderCircle className="button-spinner" aria-hidden /> Salvando…</> : "Salvar nova senha"}
        </button>
      </div>
    </form>
  );
}
