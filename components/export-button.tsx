"use client";

import { Download } from "lucide-react";
import { usePermission } from "@/components/current-user";

/**
 * Baixa a listagem em CSV com os filtros que estão na tela — é o que a pessoa
 * espera de "exportar" enquanto olha uma lista já filtrada.
 *
 * Não usa fetch nem blob: o endpoint responde com `content-disposition`, então
 * um link comum já basta e o navegador cuida do download e do nome do arquivo.
 * Por isso também não há estado de carregamento aqui — quem mostra progresso é
 * o navegador.
 *
 * Fica visível em somente leitura, junto das ações que somem: exportar é
 * justamente o que garante que a igreja não fica refém dos próprios dados.
 */
export function ExportButton({
  resource,
  permission,
  filters,
  label = "Exportar CSV",
}: {
  resource: "members" | "visitors" | "financeiro";
  permission: string;
  /** Estado dos filtros da tela. "all" e vazio viram ausência do parâmetro. */
  filters: Record<string, string | undefined>;
  label?: string;
}) {
  // Sem a permissão o botão não existe, em vez de existir e dar 403.
  const allowed = usePermission(permission);
  if (!allowed) return null;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    const trimmed = value?.trim();
    if (trimmed && trimmed !== "all") query.set(key, trimmed);
  }

  const search = query.toString();
  // Sem `download`: o nome do arquivo vem pronto do servidor, e o atributo o
  // sobrescreveria com o último segmento da URL.
  return (
    <a
      className="export-button"
      href={`/api/export/${resource}${search ? `?${search}` : ""}`}
      title="Baixar a lista atual, com os filtros aplicados"
    >
      <Download aria-hidden />
      {label}
    </a>
  );
}
