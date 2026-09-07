"use client";

import { useEffect, useRef, useState } from "react";

export function AnimatedNumber({
  value,
  duration = 900,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const frameRef = useRef<number | null>(null);
  const factor = 10 ** decimals;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayValue(value);
      return;
    }

    const start = performance.now();

    function animate(now: number) {
      // O piso em 0 não é paranoia: o carimbo que o requestAnimationFrame
      // entrega é o do INÍCIO do quadro, e ele pode ser anterior ao
      // `performance.now()` lido aqui em cima. Aí `progress` fica negativo,
      // `eased` junto, e o primeiro quadro pinta um número NEGATIVO -- medido
      // como "-0" nos indicadores de /membros. Em /financeiro isso seria um
      // saldo negativo piscando na tela.
      const progress = Math.min(Math.max((now - start) / duration, 0), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      // O `+ 0` normaliza o zero negativo: `(-0).toLocaleString("pt-BR")` é
      // "-0", e menos zero não é um número que exista para quem lê.
      setDisplayValue(Math.round(value * eased * factor) / factor + 0);

      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    }

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [duration, factor, value]);

  return <>{prefix}{displayValue.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</>;
}
