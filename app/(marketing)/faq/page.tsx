import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessagesSquare } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { marketingRoutes, signupHref } from "@/components/marketing/routes";
import { FaqSections } from "./faq-sections";

export const metadata: Metadata = {
  title: "Dúvidas frequentes",
  description:
    "Como funcionam membros, visitantes, células, ministérios, agenda e financeiro no nonia — e as perguntas que toda igreja faz sobre planos, dados e segurança.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <main className="mk-main">
      <section className="mk-faq-hero">
        <div className="mk-container">
          <Reveal className="mk-badge" as="span">
            <MessagesSquare aria-hidden /> Dúvidas frequentes
          </Reveal>
          <Reveal as="h1" delay={60}>Como o nonia funciona, recurso por recurso</Reveal>
          <Reveal as="p" delay={120}>
            Cada bloco abaixo explica um módulo do sistema e responde as
            perguntas que a liderança costuma fazer antes de assinar. Role a
            página — o índice à esquerda acompanha onde você está.
          </Reveal>
        </div>
      </section>

      <section className="mk-section mk-faq-section">
        <div className="mk-container">
          <FaqSections />
        </div>
      </section>

      <section className="mk-cta">
        <div className="mk-container">
          <Reveal className="mk-cta-card">
            <h2>Ficou alguma dúvida de fora?</h2>
            <p>
              Escreva para a gente. Respondemos em português, por gente que
              conhece a rotina de uma secretaria de igreja.
            </p>
            <div className="mk-cta-actions">
              <Link className="mk-button mk-button-primary mk-button-lg" href={signupHref()}>
                Criar conta da igreja <ArrowRight aria-hidden />
              </Link>
              <Link className="mk-button mk-button-quiet mk-button-lg" href={marketingRoutes.contact}>
                Falar com a gente
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
