import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentação",
  description: "Como cada parte do nonia funciona, recurso por recurso.",
};

export default function AjudaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
