import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "nonia.app",
    template: "%s | nonia.app",
  },
  description: "nonia: a sua igreja organizada, do cadastro ao caixa. Membros, visitantes, ministérios, agenda e financeiro num painel só.",
  applicationName: "Nonia",
  metadataBase: new URL("https://nonia.app"),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9ebe2" },
    { media: "(prefers-color-scheme: dark)", color: "#12150f" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // O layout do site público escreve `data-motion` no <html> antes da
    // hidratação - é justamente o ponto: sem isso a página pisca. O React
    // compararia esse atributo com o HTML do servidor e avisaria.
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.variable}>
        {children}
      </body>
    </html>
  );
}
