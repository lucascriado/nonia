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
import { MarketingFrame } from "@/components/marketing/marketing-frame";
import { Reveal } from "@/components/marketing/reveal";
import { marketingRoutes, signupHref } from "@/components/marketing/routes";
import { plans } from "@/components/marketing/plans";

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
    text: "Encontre qualquer pessoa da igreja em segundos, com a ficha inteira na mão.",
  },
  {
    icon: UserPlus,
    title: "Visitantes",
    text: "Saiba quem visitou e em que ponto da integração parou, sem deixar ninguém no caminho.",
  },
  {
    icon: Puzzle,
    title: "Ministérios",
    text: "Saiba quem realmente está servindo, e quem parou de aparecer.",
  },
  {
    icon: CalendarDays,
    title: "Agenda",
    text: "A igreja inteira enxerga a mesma agenda, e ninguém marca duas coisas no mesmo horário.",
  },
  {
    icon: Wallet,
    title: "Financeiro",
    text: "Preste contas sem medo: cada lançamento com o comprovante anexado.",
  },
];

const steps = [
  { title: "Crie a conta da igreja", text: "Leva um minuto e você já entra num painel pronto." },
  { title: "Traga as pessoas", text: "Cadastre membros e visitantes, ou mande a sua planilha que a gente importa." },
  { title: "Abra o painel", text: "A partir daí a liderança vê a igreja inteira numa tela." },
];

const differentials = [
  { icon: HeartHandshake, title: "Pensado para igreja", text: "A linguagem é a da sua igreja: ministério, visitante, dízimo. Não “cliente” nem “lead”." },
  { icon: Smartphone, title: "Funciona no celular", text: "Secretaria no computador, líder de ministério no telefone. As telas se adaptam de verdade." },
  { icon: Lock, title: "Cada igreja no seu espaço", text: "Os dados da sua igreja ficam isolados dos das outras. Cada assinatura é um espaço próprio." },
  { icon: History, title: "Histórico de tudo", text: "Toda alteração vira registro. Você sabe o que mudou, quem mudou e em que dia." },
];

const faqPreview = [
  { question: "Preciso instalar alguma coisa?", answer: "Não. O nonia roda no navegador; a igreja só precisa de internet." },
  { question: "Consigo migrar minha planilha atual?", answer: "Sim. A gente importa a sua lista de membros no começo." },
  { question: "Mais de uma pessoa pode usar?", answer: "Pode. Cada uma entra com o próprio acesso e enxerga só o que o papel dela permite." },
];

// A landing mora no layout raiz, que é de todo o site; por isso a moldura do
// site público entra aqui, na página, e não num layout.tsx.
export default function LandingPage() {
  return (
    <MarketingFrame>
      <Landing />
    </MarketingFrame>
  );
}

function Landing() {
  return (
    <main className="mk-main">
      <section className="mk-hero">
        <div className="mk-hero-glow" aria-hidden />
        <div className="mk-container mk-hero-inner">
          <Reveal className="mk-badge" as="span">
            <Sparkles aria-hidden /> Para a igreja que ainda controla tudo na planilha
          </Reveal>

          <Reveal as="h1" className="mk-hero-title" delay={60}>
            A sua igreja <em>organizada</em>, do cadastro ao caixa.
          </Reveal>

          <Reveal as="p" className="mk-hero-text" delay={120}>
            Quem chegou domingo, quem está servindo e quanto entrou na oferta,
            sempre no mesmo lugar.
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
            <strong>14 dias com o sistema inteiro liberado</strong>, financeiro
            incluído: até 200 pessoas cadastradas e 5 pessoas da equipe usando
            junto.
            <span>Não instala nada: abre no navegador, no computador e no celular.</span>
            <span>Sem cartão de crédito, ninguém é cobrado no fim e não existe assinatura para cancelar.</span>
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
              Cadastre a pessoa uma vez. Ela vira membro, entra na escala do
              ministério e aparece no relatório sem ninguém redigitar nada.
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
              <Reveal as="li" className="mk-step" delay={index * 460} key={step.title}>
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
            <h2>Comece pelo cadastro de hoje</h2>
            <p>
              Abra a conta, jogue a sua lista de membros para dentro e use no
              próximo domingo.
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
