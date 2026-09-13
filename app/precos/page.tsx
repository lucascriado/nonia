import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Minus, Sparkles } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { marketingRoutes, signupHref } from "@/components/marketing/routes";
import { planComparison, plans, type ComparisonValue } from "@/components/marketing/plans";

export const metadata: Metadata = {
  title: "Planos e preços",
  description:
    "Um plano por igreja: Semente grátis para até 100 membros, Comunidade por R$ 89 ao mês com membros ilimitados, e Rede sob consulta para várias congregações.",
  alternates: { canonical: "/precos" },
  openGraph: {
    title: "Planos e preços do nonia",
    description: "Semente grátis, Comunidade por R$ 89/mês, Rede sob consulta. Sem fidelidade.",
    url: "/precos",
    siteName: "nonia.app",
    locale: "pt_BR",
    type: "website",
  },
};

const billingFaq = [
  {
    question: "Preciso de cartão de crédito para começar?",
    answer: "Não. A conta é criada sem nenhum dado de pagamento, e o plano Semente não pede cartão em momento nenhum.",
  },
  {
    question: "Tem fidelidade ou multa de cancelamento?",
    answer: "Não. A assinatura é mensal e você cancela quando quiser, sem multa e sem taxa de instalação.",
  },
  {
    question: "O preço muda conforme o tamanho da igreja?",
    answer: "Não. O Comunidade custa R$ 89 por mês para qualquer tamanho de congregação - não cobramos por membro cadastrado.",
  },
  {
    question: "Posso trocar de plano depois?",
    answer: "Pode, a qualquer momento. A troca vale na hora e o valor é ajustado proporcionalmente ao que falta do mês.",
  },
  {
    question: "Se eu cancelar, o que acontece com os dados da igreja?",
    answer: "Eles continuam seus. A exportação fica disponível antes do encerramento, e a base permanece por um período depois do cancelamento caso a igreja mude de ideia.",
  },
  {
    question: "Como funciona o plano Rede?",
    answer: "Ele atende redes e denominações com várias congregações sob o mesmo contrato, cada uma com seu espaço e a liderança enxergando o consolidado. O valor depende do número de congregações - fale com a gente.",
  },
];

export default function PricingPage() {
  return (
    <main className="mk-main">
      <section className="mk-pricing-hero">
        <div className="mk-container">
          <Reveal as="span" className="mk-eyebrow">Planos</Reveal>
          <Reveal as="h1" delay={60}>Um plano por igreja, sem cobrança por membro</Reveal>
          <Reveal as="p" delay={120}>
            Assinatura mensal, sem fidelidade e sem taxa de instalação. Comece
            no plano gratuito e mude quando a igreja crescer.
          </Reveal>
        </div>
      </section>

      <section className="mk-section mk-pricing-cards">
        <div className="mk-container">
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
                <h2>{plan.name}</h2>
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

          {/* O plano de avaliação não é vendável e por isso não vira cartão,
              mas é por ele que toda conta começa: esconder isso surpreenderia
              a pessoa no 15º dia. */}
          <Reveal className="mk-trial-note" delay={320}>
            <span className="mk-trial-badge"><Sparkles aria-hidden /> Toda conta começa assim</span>
            {/* Só a avaliação: o que acontece no 15º dia está no FAQ e dentro
                do app. Aqui é ponto de decisão, e o plano Semente já aparece
                como cartão logo acima. */}
            <p>
              Os <strong>14 primeiros dias são de avaliação</strong>, com todos os
              recursos liberados, 200 pessoas e 5 usuários. Não pedimos cartão
              para começar.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mk-section mk-section-soft" id="comparativo">
        <div className="mk-container">
          <Reveal className="mk-section-head">
            <span className="mk-eyebrow">Comparativo</span>
            <h2>O que entra em cada plano</h2>
            <p>Tudo o que está marcado já funciona hoje - nada aqui é promessa de roadmap.</p>
          </Reveal>

          <Reveal className="mk-compare-scroll" delay={80}>
            <table className="mk-compare">
              <caption className="mk-visually-hidden">
                Comparativo de recursos entre os planos Semente, Comunidade e Rede.
              </caption>
              <colgroup>
                <col />
                {plans.map((plan) => <col key={plan.id} />)}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Recurso</th>
                  {plans.map((plan) => (
                    <th className={plan.highlight ? "is-highlight" : undefined} key={plan.id} scope="col">
                      <strong>{plan.name}</strong>
                      <small>
                        {plan.price === null ? "Sob consulta" : plan.price === 0 ? "Grátis" : `R$ ${plan.price}/mês`}
                      </small>
                    </th>
                  ))}
                </tr>
              </thead>
              {planComparison.map((group) => (
                <tbody key={group.title}>
                  <tr className="mk-compare-group">
                    <th colSpan={plans.length + 1} scope="colgroup">{group.title}</th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">
                        {row.label}
                        {row.note && <small>{row.note}</small>}
                      </th>
                      {row.values.map((value, index) => (
                        <td
                          className={plans[index].highlight ? "is-highlight" : undefined}
                          data-label={plans[index].name}
                          key={plans[index].id}
                        >
                          <ComparisonCell plan={plans[index].name} row={row.label} value={value} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </Reveal>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <Reveal className="mk-section-head">
            <span className="mk-eyebrow">Cobrança</span>
            <h2>Dúvidas sobre assinatura</h2>
          </Reveal>

          <div className="mk-billing-faq">
            {billingFaq.map((item, index) => (
              <Reveal as="article" delay={(index % 2) * 80} key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </Reveal>
            ))}
          </div>

          <Reveal as="p" className="mk-plan-footnote" delay={200}>
            Ficou outra dúvida? <Link href={marketingRoutes.faq}>Veja as dúvidas sobre os recursos</Link> ou{" "}
            <a href={marketingRoutes.contact}>fale com a gente</a>.
          </Reveal>
        </div>
      </section>

      <section className="mk-cta">
        <div className="mk-container">
          <Reveal className="mk-cta-card">
            <h2>Comece pelo gratuito</h2>
            <p>Crie a conta da igreja, cadastre os primeiros membros e decida o plano depois.</p>
            <div className="mk-cta-actions">
              <Link className="mk-button mk-button-primary mk-button-lg" href={signupHref()}>
                Criar conta da igreja <ArrowRight aria-hidden />
              </Link>
              <Link className="mk-button mk-button-quiet mk-button-lg" href={marketingRoutes.faq}>
                Ver as dúvidas
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

/**
 * Célula do comparativo. O ícone sozinho não diz nada para quem usa leitor de
 * tela - e, no celular, a tabela vira lista e a coluna deixa de identificar o
 * plano. Por isso cada célula carrega um texto próprio.
 */
function ComparisonCell({ value, plan, row }: { value: ComparisonValue; plan: string; row: string }) {
  if (typeof value === "string") return <span className="mk-compare-value">{value}</span>;

  return value ? (
    <span className="mk-compare-yes">
      <Check aria-hidden />
      <span className="mk-visually-hidden">{`${row}: incluído no ${plan}`}</span>
    </span>
  ) : (
    <span className="mk-compare-no">
      <Minus aria-hidden />
      <span className="mk-visually-hidden">{`${row}: não incluído no ${plan}`}</span>
    </span>
  );
}
