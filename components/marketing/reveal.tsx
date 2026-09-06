"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  /** Elemento renderizado. Use o semântico certo em vez de embrulhar num div. */
  as?: ElementType;
  className?: string;
  /** Atraso em ms, para escalonar itens de uma mesma lista. */
  delay?: number;
  style?: CSSProperties;
};

/**
 * Revela o conteúdo quando ele entra na viewport. A animação é CSS puro; aqui
 * só entra a classe `is-visible`. Sem IntersectionObserver o conteúdo aparece
 * imediatamente, e quem pediu menos movimento nunca chega a esconder nada —
 * o atributo `data-motion` do `<html>` só é ligado fora de `reduced-motion`.
 */
export function Reveal({ children, as: Tag = "div", className, delay = 0, style }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  const classes = ["mk-reveal", visible ? "is-visible" : "", className].filter(Boolean).join(" ");

  return (
    <Tag className={classes} ref={ref} style={{ "--reveal-delay": `${delay}ms`, ...style } as CSSProperties}>
      {children}
    </Tag>
  );
}
