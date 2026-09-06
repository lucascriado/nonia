"use client";

import { useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

/**
 * No celular o bloco de filtros ficava aberto e empurrava o conteúdo para
 * fora da primeira tela — em /ministerios eram 564px de cabeçalho, indicadores e
 * filtros antes do primeiro cartão, ou seja, nenhum dado visível sem rolar.
 * Aqui os filtros começam recolhidos atrás de um botão que diz quantos estão
 * ativos.
 *
 * No desktop este componente é invisível: o botão some e o invólucro usa
 * `display: contents`, então o layout original dos filtros continua igual.
 */
export function FilterDisclosure({
  children,
  activeCount = 0,
}: {
  children: React.ReactNode;
  /** Quantos filtros estão aplicados, para o botão avisar sem precisar abrir. */
  activeCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={`filter-disclosure${open ? " is-open" : ""}`}>
      <button
        aria-controls={id}
        aria-expanded={open}
        className="filter-disclosure-toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <SlidersHorizontal aria-hidden />
        Filtros
        {activeCount > 0 && <span className="filter-disclosure-count">{activeCount}</span>}
      </button>
      <div className="filter-disclosure-body" id={id}>
        {children}
      </div>
    </div>
  );
}
