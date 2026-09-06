import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse o painel da sua igreja no nonia.",
  alternates: { canonical: "/entrar" },
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <main className="mk-main mk-auth">
      <div className="mk-container mk-auth-inner">
        <Suspense fallback={<div className="mk-auth-card" aria-busy="true" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
