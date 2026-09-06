import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppPreferences } from "@/components/app-preferences";
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
  description: "Nonia — plataforma de gestão ministerial: membros, visitantes, células, ministérios e agenda.",
  applicationName: "Nonia",
  metadataBase: new URL("https://nonia.app"),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9ebe2" },
    { media: "(prefers-color-scheme: dark)", color: "#12150f" },
  ],
};

// Aplica o tema salvo antes da primeira pintura para evitar flash do tema
// claro quando o usuário usa o modo escuro. O idioma é fixo em pt-BR no
// <html>: a interface é escrita em português e não há tradução para trocar.
const preferencesInitScript = `try{var p=JSON.parse(localStorage.getItem("nonia-app-preferences")||"{}");if(p.theme)document.documentElement.dataset.theme=p.theme;}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Os scripts inline abaixo escrevem tema, fonte e `data-motion` no <html>
    // antes da hidratação — é justamente o ponto: sem isso a página pisca. O
    // React compararia esses atributos com o HTML do servidor e avisaria.
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.variable}>
        <script dangerouslySetInnerHTML={{ __html: preferencesInitScript }} />
        <AppPreferences />
        {children}
      </body>
    </html>
  );
}
