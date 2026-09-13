import type { Metadata } from "next";

// As páginas do app são Client Components e não podem exportar `metadata`.
// Este layout existe só para dar título e descrição à rota — sem ele o Next
// aplica o título padrão do site em todas as telas do sistema.
export const metadata: Metadata = {
  title: "Membros",
  description: "Cadastro de membros com busca, filtros, células e histórico.",
};

export default function MembrosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
