"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthField } from "@/components/auth/auth-field";
import { AuthError, emailProblem, passwordProblem, register } from "@/components/auth/session";
import { marketingRoutes } from "@/components/marketing/routes";
import { maskPhone } from "@/components/masks";
import { plans } from "@/components/marketing/plans";

type Errors = Partial<Record<"organizationName" | "fullName" | "email" | "document" | "password", string>>;

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [values, setValues] = useState({ organizationName: "", fullName: "", email: "", phone: "", document: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // O plano escolhido na landing viaja em `?plano=`. Serve só para lembrar a
  // escolha na tela: o registro cria a assinatura em avaliação de qualquer jeito.
  const chosenPlan = plans.find((plan) => plan.id === params.get("plano"));

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate(): Errors {
    return {
      organizationName: values.organizationName.trim() ? undefined : "Informe o nome da igreja.",
      fullName: values.fullName.trim().includes(" ") ? undefined : "Informe seu nome completo.",
      email: emailProblem(values.email) ?? undefined,
      password: passwordProblem(values.password) ?? undefined,
    };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const problems = validate();
    setErrors(problems);
    setFormError(null);
    if (Object.values(problems).some(Boolean)) return;

    setSubmitting(true);
    try {
      await register({
        organizationName: values.organizationName.trim(),
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        password: values.password,
        phone: values.phone.trim() || undefined,
        document: values.document.trim() || undefined,
      });
      router.replace(marketingRoutes.app);
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;

      // Erro que pertence a um campo é mostrado no campo; o resto vira alerta
      // do formulário. Sem isso o usuário lê "e-mail já cadastrado" no topo e
      // não sabe qual campo corrigir.
      if (error.code === "email_taken") setErrors((current) => ({ ...current, email: error.message }));
      else if (error.code === "weak_password") setErrors((current) => ({ ...current, password: error.message }));
      // Documento inválido é erro DE CAMPO: mostrar no topo faria a pessoa
      // procurar o que corrigir num formulário de seis campos.
      else if (error.code === "invalid_document") setErrors((current) => ({ ...current, document: error.message }));
      else setFormError(error.message);

      setSubmitting(false);
    }
  }

  return (
    <div className="mk-auth-card">
      <header className="mk-auth-head">
        <h1>Cadastre sua igreja</h1>
        <p>
          {chosenPlan
            ? <>Você escolheu o plano <strong>{chosenPlan.name}</strong>. Comece agora e ajuste depois.</>
            : "Crie a conta da congregação. Você entra como responsável."}
        </p>
      </header>

      <AuthAlert message={formError} />

      <form className="mk-auth-form" noValidate onSubmit={handleSubmit}>
        <AuthField
          autoComplete="organization"
          autoFocus
          error={errors.organizationName}
          label="Nome da igreja"
          onChange={(event) => update("organizationName", event.target.value)}
          placeholder="Ex.: Igreja Batista Central"
          value={values.organizationName}
        />

        <AuthField
          autoComplete="name"
          error={errors.fullName}
          label="Seu nome completo"
          onChange={(event) => update("fullName", event.target.value)}
          placeholder="Nome e sobrenome"
          value={values.fullName}
        />

        <AuthField
          autoComplete="email"
          error={errors.email}
          inputMode="email"
          label="E-mail"
          onChange={(event) => update("email", event.target.value)}
          placeholder="voce@suaigreja.com.br"
          type="email"
          value={values.email}
        />

        <AuthField
          autoComplete="tel"
          hint="Opcional. Usamos só para falar com você sobre a conta."
          inputMode="tel"
          label="Telefone"
          maxLength={16}
          onChange={(event) => update("phone", maskPhone(event.target.value))}
          placeholder="(00) 0 0000-0000"
          value={values.phone}
        />

        {/* SEM máscara e SEM filtrar para dígito: desde 31/07/2026 a Receita
            emite CNPJ alfanumérico, com letras nas 12 primeiras posições. Uma
            máscara de números recusaria o documento de qualquer igreja aberta
            de agosto em diante - e recusaria na porta, no cadastro. */}
        <AuthField
          autoCapitalize="characters"
          error={errors.document}
          hint="Opcional. Aceita CNPJ (inclusive o novo, com letras) ou o CPF do responsável."
          label="CNPJ da igreja"
          maxLength={18}
          onChange={(event) => update("document", event.target.value.toUpperCase())}
          value={values.document}
        />

        <AuthField
          autoComplete="new-password"
          error={errors.password}
          hint="Pelo menos 8 caracteres, misturando letras e números."
          label="Senha"
          onChange={(event) => update("password", event.target.value)}
          placeholder="Crie uma senha"
          type="password"
          value={values.password}
        />

        <button className="mk-button mk-button-primary mk-button-lg" disabled={submitting} type="submit">
          {submitting ? <><LoaderCircle className="mk-spin" aria-hidden /> Criando a conta…</> : <>Criar conta da igreja <ArrowRight aria-hidden /></>}
        </button>
      </form>

      <p className="mk-auth-foot">
        Já tem conta? <Link href={marketingRoutes.login}>Entrar</Link>
      </p>
    </div>
  );
}
