"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthField } from "@/components/auth/auth-field";
import { AuthError, emailProblem, login } from "@/components/auth/session";
import { marketingRoutes, signupHref } from "@/components/marketing/routes";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Para onde voltar depois de entrar. O nome do parâmetro é `redirect`
  // porque é o que o proxy escreve ao barrar uma página protegida.
  // Só caminho interno: um destino externo transformaria a tela de login num
  // redirecionador aberto.
  const requested = params.get("redirect");
  const destination = requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : marketingRoutes.app;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const problems = {
      email: emailProblem(email) ?? undefined,
      password: password ? undefined : "Informe a senha.",
    };
    setFieldErrors(problems);
    setFormError(null);
    if (problems.email || problems.password) return;

    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      // `replace` para o botão voltar não trazer o usuário de volta ao login.
      router.replace(destination);
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;

      // O backend responde igual para senha errada e e-mail inexistente, de
      // propósito. A tela mantém esse sigilo mostrando o erro no formulário,
      // nunca apontando um campo — e usa a mensagem dele, que já vem pronta
      // em português.
      setFormError(error.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mk-auth-card">
      <header className="mk-auth-head">
        <h1>Entrar no nonia</h1>
        <p>Acesse o painel da sua igreja.</p>
      </header>

      <AuthAlert message={formError} />

      <form className="mk-auth-form" noValidate onSubmit={handleSubmit}>
        <AuthField
          autoComplete="email"
          autoFocus
          error={fieldErrors.email}
          inputMode="email"
          label="E-mail"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@suaigreja.com.br"
          type="email"
          value={email}
        />

        <AuthField
          autoComplete="current-password"
          error={fieldErrors.password}
          label="Senha"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Sua senha"
          type="password"
          value={password}
        />

        <button className="mk-button mk-button-primary mk-button-lg" disabled={submitting} type="submit">
          {submitting ? <><LoaderCircle className="mk-spin" aria-hidden /> Entrando…</> : <>Entrar <ArrowRight aria-hidden /></>}
        </button>
      </form>

      <p className="mk-auth-foot">
        Ainda não tem conta? <Link href={signupHref()}>Cadastre sua igreja</Link>
      </p>
    </div>
  );
}
