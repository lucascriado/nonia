import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WhatsApp",
  description: "Conexão da igreja no WhatsApp e envio de mensagens em massa.",
};

export default function WhatsappLayout({ children }: { children: React.ReactNode }) {
  return children;
}
