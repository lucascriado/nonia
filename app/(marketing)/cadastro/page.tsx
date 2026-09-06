import type { Metadata } from "next";
import { Suspense } from "react";
import { Check } from "lucide-react";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Cadastre sua igreja",
  description:
    "Crie a conta da sua igreja no nonia em um minuto. São 14 dias de avaliação e depois o plano Semente gratuito, sem cartão de crédito.",
  alternates: { canonical: "/cadastro" },
};

const reassurances = [
  "14 dias de avaliação com tudo liberado: 200 pessoas e 5 usuários",
  "Terminado o prazo, a conta continua de graça no Semente, sem expirar",
  "Sem cartão de crédito e sem taxa de instalação",
  "Membros, visitantes, células, ministérios, agenda e financeiro desde o primeiro dia",
  "Seus dados são da igreja: exportação sempre disponível",
];

export default function SignupPage() {
  return (
    <main className="mk-main mk-auth">
      <div className="mk-container mk-auth-inner mk-auth-split">
        {/* A coluna da esquerda é a parte de conversão: quem chega aqui pela
            landing precisa ver o motivo de preencher antes do formulário. */}
        <aside className="mk-auth-pitch">
          <h2>Sua igreja organizada já neste domingo</h2>
          <p>
            Você cria o espaço da congregação, cadastra os primeiros membros e
            o painel ganha vida na hora. Leva um minuto.
          </p>
          <ul>
            {reassurances.map((item) => (
              <li key={item}><Check aria-hidden /> {item}</li>
            ))}
          </ul>
        </aside>

        <Suspense fallback={<div className="mk-auth-card" aria-busy="true" />}>
          <RegisterForm />
        </Suspense>
      </div>
    </main>
  );
}
