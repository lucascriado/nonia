import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  HeartHandshake,
  History,
  Lock,
  MessageCircleQuestion,
  Puzzle,
  Smartphone,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { marketingRoutes, signupHref } from "@/components/marketing/routes";
import { plans } from "./plans";

export const metadata: Metadata = {
  title: "nonia - a sua igreja organizada, do cadastro ao caixa",
  description:
    "Membros, visitantes, ministérios, agenda e financeiro num painel só, no lugar das planilhas.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "nonia - a sua igreja organizada, do cadastro ao caixa",
    description:
      "Membros, visitantes, ministérios, agenda e financeiro num painel só.",
    url: "/",
    siteName: "nonia.app",
    locale: "pt_BR",
    type: "website",
  },
};

const features = [
  {
    icon: Users,
    title: "Membros",
    text: "Ficha completa com foto, contato e histórico, com busca e filtros que aguentam a igreja inteira.",
  },
  {
    icon: UserPlus,
    title: "Visitantes",
    text: "Acompanhe quem chegou e converta em membro sem redigitar nada.",
  },
  {
    icon: Puzzle,
    title: "Ministérios",
    text: "Equipes, responsáveis e presença nos encontros, para saber quem está servindo.",
  },
  {
    icon: CalendarDays,
    title: "Agenda",
    text: "Cultos, reuniões e eventos, com os próximos compromissos sempre à vista.",
  },
  {
    icon: Wallet,
    title: "Financeiro",
    text: "Entradas, saídas e saldo, com comprovante anexado em cada lançamento.",
  },
];

const steps = [
  {
    title: "Crie o espaço da sua igreja",
    text: "Você cria a conta, dá nome à congregação e já entra num painel pronto. Nada de instalar servidor ou contratar técnico.",
  },
  {
    title: "Traga as pessoas",
    text: "Cadastre membros e visitantes e monte os ministérios. Cada registro guarda quem alterou o quê e quando.",
  },
  {
    title: "Acompanhe pelo painel",
    text: "Indicadores, aniversariantes do mês, próximos eventos e atividades recentes na primeira tela - a liderança enxerga a igreja de relance.",
  },
];

const differentials = [
  { icon: HeartHandshake, title: "Pensado para igreja", text: "A linguagem é a da sua congregação: ministério, visitante, dízimo, não “cliente” e “lead”." },
  { icon: Smartphone, title: "Funciona no celular", text: "Secretaria no computador, líder de ministério no telefone. As telas se adaptam de verdade, sem versão capenga." },
  { icon: Lock, title: "Cada igreja no seu espaço", text: "Os dados da sua congregação ficam isolados dos das outras. Cada assinatura é um ambiente próprio." },
  { icon: History, title: "Histórico de tudo", text: "Toda alteração relevante vira registro de atividade. Você sabe o que mudou, quem mudou e em que dia." },
];

const faqPreview = [
  { question: "Preciso instalar alguma coisa?", answer: "Não. O nonia roda no navegador; a igreja só precisa de internet." },
  { question: "Consigo migrar minha planilha atual?", answer: "Sim. A gente ajuda a importar a lista de membros no começo do plano Comunidade." },
  { question: "Posso testar antes de pagar?", answer: "Toda igreja começa com 14 dias de avaliação, com 200 pessoas e 5 usuários liberados. Terminado o prazo, a conta continua no plano Semente, que é gratuito e não expira." },
];

export default function LandingPage() {
  return (
    <main className="mk-main">
      <section className="mk-hero">
        <div className="mk-hero-glow" aria-hidden />
        <div className="mk-container mk-hero-inner">
          <Reveal className="mk-badge" as="span">
            <Sparkles aria-hidden /> Tudo da sua igreja num sistema só
          </Reveal>

          <Reveal as="h1" className="mk-hero-title" delay={60}>
            A sua igreja <em>organizada</em>, do cadastro ao caixa.
          </Reveal>

          <Reveal as="p" className="mk-hero-text" delay={120}>
            Membros, visitantes, ministérios, agenda e financeiro num painel só,
            no lugar das planilhas.
          </Reveal>

          <Reveal className="mk-hero-actions" delay={180}>
            <Link className="mk-button mk-button-primary mk-button-lg" href={signupHref()}>
              Criar conta da igreja <ArrowRight aria-hidden />
            </Link>
            <Link className="mk-button mk-button-ghost mk-button-lg" href={marketingRoutes.pricing}>
              Ver planos
            </Link>
          </Reveal>

          {/* Só a avaliação. O que acontece no 15º dia está no FAQ e dentro do
              app: na hora de decidir, falar do rebaixamento joga contra a
              própria oferta. */}
          <Reveal as="p" className="mk-hero-note" delay={240}>
            14 dias com todos os recursos. Sem cartão de crédito.
          </Reveal>

          <Reveal className="mk-hero-figure" delay={300}>
            <PainelPreview />
          </Reveal>
        </div>
      </section>

      <section className="mk-strip" aria-label="O que o nonia resolve">
        <div className="mk-container mk-strip-inner">
          {/* Encurtados para caber em UMA linha em maiúsculo, sem apelar para
              fonte menor: em versal o mesmo texto ocupa mais largura. */}
          {[
            "Cadastro sempre em dia",
            "Visitante virando membro",
            "Contas com comprovante",
            "Agenda de todo mundo",
          ].map((item, index) => (
            <Reveal as="span" delay={index * 70} key={item}>
              <Check aria-hidden /> {item}
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mk-section" id="recursos">
        <div className="mk-container">
          <Reveal className="mk-section-head">
            <span className="mk-eyebrow">Recursos</span>
            <h2>Cinco módulos que conversam entre si</h2>
            <p>
              O visitante que você cadastra hoje vira membro amanhã e aparece na
              escala do ministério, sem recadastrar nada.
            </p>
          </Reveal>

          <div className="mk-feature-grid">
            {features.map((feature, index) => (
              <Reveal as="article" className="mk-feature-card" delay={(index % 3) * 90} key={feature.title}>
                <span className="mk-feature-icon" aria-hidden><feature.icon /></span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section mk-section-soft" id="como-funciona">
        <div className="mk-container">
          <Reveal className="mk-section-head">
            <span className="mk-eyebrow">Como funciona</span>
            <h2>Da planilha ao painel em uma tarde</h2>
          </Reveal>

          <ol className="mk-steps">
            {steps.map((step, index) => (
              <Reveal as="li" className="mk-step" delay={index * 110} key={step.title}>
                <span className="mk-step-number" aria-hidden>{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container mk-split">
          <Reveal className="mk-split-text">
            <span className="mk-eyebrow">Por que o nonia</span>
            <h2>Feito para igreja, não adaptado de um CRM</h2>
            <p>
              Sistemas genéricos obrigam a liderança a traduzir a vida da igreja
              para um vocabulário que não é o dela. Aqui, cada tela já nasce com
              os conceitos que a sua congregação usa todo domingo.
            </p>
            <Link className="mk-button mk-button-primary" href={signupHref()}>
              Começar de graça <ArrowRight aria-hidden />
            </Link>
          </Reveal>

          <div className="mk-differentials">
            {differentials.map((item, index) => (
              <Reveal as="article" className="mk-differential" delay={index * 90} key={item.title}>
                <span aria-hidden><item.icon /></span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section mk-section-soft" id="planos">
        <div className="mk-container">
          <Reveal className="mk-section-head">
            <span className="mk-eyebrow">Planos</span>
            <h2>Um plano por igreja, do primeiro cadastro à rede inteira</h2>
            <p>
              Toda igreja começa com 14 dias liberados, com 200 pessoas e 5
              usuários. Assinatura mensal, sem fidelidade.
            </p>
          </Reveal>

          <div className="mk-plan-grid">
            {plans.map((plan, index) => (
              <Reveal
                as="article"
                className={`mk-plan${plan.highlight ? " is-highlight" : ""}`}
                delay={index * 100}
                key={plan.id}
              >
                {plan.highlight && <span className="mk-plan-tag">Mais escolhido</span>}
                <span className="mk-plan-icon" aria-hidden><plan.icon /></span>
                <h3>{plan.name}</h3>
                <p className="mk-plan-tagline">{plan.tagline}</p>

                <p className="mk-plan-price">
                  {plan.price === null ? (
                    <strong>Sob medida</strong>
                  ) : plan.price === 0 ? (
                    <strong>Grátis</strong>
                  ) : (
                    <>
                      <small>R$</small><strong>{plan.price}</strong><small>/mês</small>
                    </>
                  )}
                </p>
                <p className="mk-plan-note">{plan.priceNote}</p>

                <Link
                  className={`mk-button ${plan.highlight ? "mk-button-primary" : "mk-button-ghost"}`}
                  href={plan.price === null ? marketingRoutes.contact : signupHref(plan.id)}
                >
                  {plan.cta}
                </Link>

                <ul className="mk-plan-features">
                  {plan.features.map((feature) => (
                    <li key={feature}><Check aria-hidden /> {feature}</li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>

          <Reveal as="p" className="mk-plan-footnote" delay={320}>
            Precisa comparar em detalhe? <Link href={marketingRoutes.pricing}>Veja a tabela completa de planos</Link>.
          </Reveal>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container mk-faq-preview">
          <Reveal className="mk-section-head mk-section-head-left">
            <span className="mk-eyebrow">Dúvidas</span>
            <h2>As perguntas que toda igreja faz antes de começar</h2>
            <Link className="mk-link-arrow" href={marketingRoutes.faq}>
              Ver todas as dúvidas <ArrowRight aria-hidden />
            </Link>
          </Reveal>

          <div className="mk-faq-list">
            {faqPreview.map((item, index) => (
              <Reveal as="article" className="mk-faq-item" delay={index * 90} key={item.question}>
                <span aria-hidden><MessageCircleQuestion /></span>
                <div>
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-cta">
        <div className="mk-container">
          <Reveal className="mk-cta-card">
            <h2>Sua igreja organizada já neste domingo</h2>
            <p>
              Crie a conta, cadastre os primeiros membros e veja o painel ganhar
              vida. São 14 dias com todos os recursos liberados.
            </p>
            <div className="mk-cta-actions">
              <Link className="mk-button mk-button-primary mk-button-lg" href={signupHref()}>
                Criar conta da igreja <ArrowRight aria-hidden />
              </Link>
              <Link className="mk-button mk-button-quiet mk-button-lg" href={marketingRoutes.pricing}>
                Comparar planos
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

/**
 * Miniatura do painel. É decoração - dados ilustrativos e `aria-hidden`, para
 * o leitor de tela não anunciar números que não existem em lugar nenhum.
 */
function PainelPreview() {
  const cards = [
    { label: "Membros ativos", value: "482", icon: Users },
    { label: "Visitantes no mês", value: "37", icon: UserPlus },
    { label: "Ministérios", value: "9", icon: Puzzle },
    { label: "Aniversariantes", value: "19", icon: CalendarDays },
  ];

  return (
    <div aria-hidden className="mk-preview">
      <div className="mk-preview-bar">
        <span /><span /><span />
        <small>nonia.app/painel</small>
      </div>
      <div className="mk-preview-body">
        <aside className="mk-preview-side">
          <span className="mk-preview-logo" />
          {Array.from({ length: 7 }, (_, index) => <span className="mk-preview-nav" key={index} />)}
        </aside>
        <div className="mk-preview-content">
          <div className="mk-preview-stats">
            {cards.map((card) => (
              <div className="mk-preview-stat" key={card.label}>
                <span className="mk-preview-stat-icon"><card.icon /></span>
                <small>{card.label}</small>
                <strong>{card.value}</strong>
              </div>
            ))}
          </div>
          <div className="mk-preview-panels">
            <div className="mk-preview-panel mk-preview-panel-wide">
              {Array.from({ length: 35 }, (_, index) => (
                <span className={index % 9 === 4 ? "mk-preview-day is-marked" : "mk-preview-day"} key={index} />
              ))}
            </div>
            <div className="mk-preview-panel">
              {Array.from({ length: 5 }, (_, index) => (
                <span className="mk-preview-row" key={index}><i /><b /></span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
