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

// Aplica tema, fonte e idioma salvos antes da primeira pintura para evitar
// flash do tema claro quando o usuário usa o modo escuro.
const preferencesInitScript = `try{var p=JSON.parse(localStorage.getItem("nonia-app-preferences")||"{}");var d=document.documentElement;if(p.theme)d.dataset.theme=p.theme;if(p.fontSize)d.dataset.fontSize=p.fontSize;if(p.language)d.lang=p.language;}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={inter.variable}>
        <script dangerouslySetInnerHTML={{ __html: preferencesInitScript }} />
        <AppPreferences />
        {children}
      </body>
    </html>
  );
}
