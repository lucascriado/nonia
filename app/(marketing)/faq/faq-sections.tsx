"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { faqTopics } from "./faq-data";

export function FaqSections() {
  const activeId = useActiveTopic();

  return (
    <div className="mk-faq-layout">
      <nav aria-label="Índice de recursos" className="mk-faq-index">
        <strong>Recursos</strong>
        {faqTopics.map((topic) => (
          <a
            aria-current={activeId === topic.id ? "true" : undefined}
            className={activeId === topic.id ? "is-active" : undefined}
            href={`#${topic.id}`}
            key={topic.id}
          >
            <topic.icon aria-hidden />
            <span>{topic.title}</span>
          </a>
        ))}
      </nav>

      <div className="mk-faq-topics">
        {faqTopics.map((topic) => (
          <section aria-labelledby={`${topic.id}-titulo`} className="mk-topic" id={topic.id} key={topic.id}>
            <Reveal className="mk-topic-head">
              <span className="mk-topic-icon" aria-hidden><topic.icon /></span>
              <span className="mk-eyebrow">{topic.eyebrow}</span>
              <h2 id={`${topic.id}-titulo`}>{topic.title}</h2>
              <p>{topic.summary}</p>
            </Reveal>

            <Reveal as="ul" className="mk-topic-points" delay={100}>
              {topic.points.map((point, index) => (
                <Reveal as="li" delay={160 + index * 110} key={point}>{point}</Reveal>
              ))}
            </Reveal>

            <Reveal className="mk-topic-questions" delay={140}>
              {topic.questions.map((item) => (
                <Accordion answer={item.answer} key={item.question} question={item.question} />
              ))}
            </Reveal>
          </section>
        ))}
      </div>
    </div>
  );
}

function Accordion({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const id = question.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();

  return (
    <div className={`mk-accordion${open ? " is-open" : ""}`}>
      <button aria-controls={id} aria-expanded={open} onClick={() => setOpen((value) => !value)} type="button">
        <span>{question}</span>
        <ChevronDown aria-hidden />
      </button>
      {/* A altura anima de 0fr para 1fr: o conteúdo não precisa ter altura
          conhecida e nada é medido em JavaScript. */}
      <div className="mk-accordion-panel" id={id} role="region">
        <p>{answer}</p>
      </div>
    </div>
  );
}

/**
 * Marca no índice lateral o recurso que está sendo lido. Usa o mesmo
 * IntersectionObserver das animações - a faixa central da tela decide quem
 * está ativo, então rolar rápido não pisca entre duas seções.
 */
function useActiveTopic() {
  const [activeId, setActiveId] = useState(faqTopics[0]?.id ?? "");
  const visible = useRef(new Set<string>());

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.current.add(entry.target.id);
          else visible.current.delete(entry.target.id);
        }

        const current = faqTopics.find((topic) => visible.current.has(topic.id));
        if (current) setActiveId(current.id);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );

    for (const topic of faqTopics) {
      const node = document.getElementById(topic.id);
      if (node) observer.observe(node);
    }

    return () => observer.disconnect();
  }, []);

  return activeId;
}
