import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Usuários",
  description: "Quem tem acesso ao painel da igreja e com qual papel.",
};

export default function UsuariosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
