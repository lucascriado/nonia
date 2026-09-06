"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, MailX } from "lucide-react";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthField } from "@/components/auth/auth-field";
import { AuthError, acceptInvite, getInvite, passwordProblem, type Invite } from "@/components/auth/session";
import { marketingRoutes } from "@/components/marketing/routes";

export function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    getInvite(token)
      .then((data) => {
        if (!active) return;
        setInvite(data);
        setFullName(data.fullName ?? "");
      })
      .catch((error) => active && setLoadError(error instanceof AuthError ? error.message : "Não foi possível carregar o convite."));

    return () => {
      active = false;
    };
  }, [token]);

  // Quem já tem conta entra com a senha ATUAL; quem não tem cria uma senha
  // nova, e aí valem as regras de força.
  const hasAccount = invite?.hasAccount ?? false;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !invite) return;

    const problems = {
      fullName: hasAccount || fullName.trim().includes(" ") ? undefined : "Informe seu nome completo.",
      password: hasAccount
        ? (password ? undefined : "Informe a senha da sua conta.")
        : (passwordProblem(password) ?? undefined),
    };
    setFieldErrors(problems);
    setFormError(null);
    if (problems.fullName || problems.password) return;

    setSubmitting(true);
    try {
      await acceptInvite({ token, password, fullName: hasAccount ? undefined : fullName.trim() });
      router.replace(marketingRoutes.app);
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;

      if (error.code === "weak_password") setFieldErrors((current) => ({ ...current, password: error.message }));
      else if (error.code === "invalid_credentials") setFieldErrors((current) => ({ ...current, password: "Senha incorreta." }));
      else if (error.code === "invalid_invitation") setLoadError(error.message);
      else setFormError(error.message);

      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="mk-auth-card mk-auth-empty">
        <span className="mk-auth-empty-icon" aria-hidden><MailX /></span>
        <h1>Convite indisponível</h1>
        <p>{loadError}</p>
        <p className="mk-auth-foot">
          Peça um novo convite a quem administra a conta da igreja, ou <Link href={marketingRoutes.login}>entre</Link> se você já faz parte.
        </p>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="mk-auth-card mk-auth-loading" aria-busy="true">
        <LoaderCircle className="mk-spin" aria-hidden />
        <p>Conferindo o convite…</p>
      </div>
    );
  }

  return (
    <div className="mk-auth-card">
      <header className="mk-auth-head">
        <h1>Você foi convidado</h1>
        <p>
          <strong>{invite.organizationName}</strong> convidou <strong>{invite.email}</strong> para
          participar como <strong>{invite.roleName}</strong>.
        </p>
      </header>

      <AuthAlert message={formError} />

      <form className="mk-auth-form" noValidate onSubmit={handleSubmit}>
        {!hasAccount && (
          <AuthField
            autoComplete="name"
            autoFocus
            error={fieldErrors.fullName}
            label="Seu nome completo"
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Nome e sobrenome"
            value={fullName}
          />
        )}

        <AuthField
          autoComplete={hasAccount ? "current-password" : "new-password"}
          autoFocus={hasAccount}
          error={fieldErrors.password}
          hint={hasAccount ? "Você já tem conta no nonia — use a senha dela." : "Pelo menos 8 caracteres, misturando letras e números."}
          label={hasAccount ? "Senha da sua conta" : "Crie uma senha"}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />

        <button className="mk-button mk-button-primary mk-button-lg" disabled={submitting} type="submit">
          {submitting ? <><LoaderCircle className="mk-spin" aria-hidden /> Entrando…</> : <>Aceitar convite <ArrowRight aria-hidden /></>}
        </button>
      </form>
    </div>
  );
}
