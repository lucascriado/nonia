"use client";

import { useLayoutEffect } from "react";

/**
 * ANDAIME TEMPORÁRIO — sai quando o tema for aprovado.
 *
 * Liga a paleta em avaliação só na tela onde este componente é montado, para
 * que ela possa ser comparada com o sage/verde-floresta das demais sem que
 * ninguém precise refazer dez telas antes da decisão. Aprovada a direção, os
 * tokens de `[data-palette="indigo"]` sobem para o `:root` do globals.css e
 * este arquivo é apagado.
 */
export function PalettePreview({ palette = "indigo" }: { palette?: string }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.palette;
    root.dataset.palette = palette;

    return () => {
      if (previous) root.dataset.palette = previous;
      else delete root.dataset.palette;
    };
  }, [palette]);

  return null;
}
