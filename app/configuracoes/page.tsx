"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Globe2, Mail, Moon, Phone, Settings, Type } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard-shell";
import { readPreferences, savePreferences } from "@/components/app-preferences";

type Theme = "light" | "dark";
type Language = "pt-BR" | "en-US" | "es-ES";
type FontSize = "small" | "medium" | "large";

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>("light");
  const [language, setLanguage] = useState<Language>("pt-BR");
  const [fontSize, setFontSize] = useState<FontSize>("medium");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const preferences = readPreferences();
    setTheme(preferences.theme);
    setLanguage(preferences.language);
    setFontSize(preferences.fontSize);
    setReady(true);
  }, []);

  function updatePreferences(next: { theme?: Theme; language?: Language; fontSize?: FontSize }) {
    const updated = {
      theme: next.theme ?? theme,
      language: next.language ?? language,
      fontSize: next.fontSize ?? fontSize,
    };

    setTheme(updated.theme);
    setLanguage(updated.language);
    setFontSize(updated.fontSize);
    savePreferences(updated);
    if (ready) toast.success("Preferência atualizada");
  }

  return (
    <DashboardShell title="Configurações">
      <main className="settings-main">
        <section className="resource-heading settings-heading">
          <div>
            <h2>Configurações</h2>
            <p>Gerencie seu perfil e as preferências da plataforma.</p>
          </div>
        </section>

        <section className="settings-grid">
          <aside className="settings-profile">
            <article className="profile-card">
              <div className="profile-cover" />
              <Image src="/renato.png" alt="Pr. Renato" width={96} height={96} />
              <h3>Pr. Renato Almeida</h3>
              <small>Pastor Titular</small>
              <div className="profile-info"><span><Mail />E-mail cadastrado</span><strong>contato@nonia.app</strong></div>
              <div className="profile-info"><span><Phone />Telefone</span><strong>(11) 98765-4321</strong></div>
              <button>Editar Informações Básicas</button>
            </article>
          </aside>

          <section className="settings-stack">
            <article className="settings-card">
              <header><span><Settings /></span><h3>Preferências do Sistema</h3></header>
              <div className="setting-row">
                <span><strong><Type />Tamanho da Fonte</strong><small>Ajuste a escala visual para facilitar a leitura.</small></span>
                <div className="segmented-control">
                  {(["small", "medium", "large"] as const).map((item) => (
                    <button className={fontSize === item ? "active" : undefined} key={item} onClick={() => updatePreferences({ fontSize: item })}>
                      {item === "small" ? "Pequeno" : item === "medium" ? "Médio" : "Grande"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="setting-row">
                <span><strong><Moon />Modo Escuro</strong><small>Reduz a fadiga ocular em ambientes pouco iluminados.</small></span>
                <button className={`switch ${theme === "dark" ? "active" : ""}`} onClick={() => updatePreferences({ theme: theme === "dark" ? "light" : "dark" })} aria-label="Alternar modo escuro"><i /></button>
              </div>
              <div className="setting-row">
                <span><strong><Globe2 />Idioma e Região</strong><small>Configurações regionais e formato de data.</small></span>
                <label className="language-select">
                  <b />
                  <select value={language} onChange={(event) => updatePreferences({ language: event.target.value as Language })} aria-label="Idioma do sistema">
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="en-US">English (United States)</option>
                    <option value="es-ES">Español</option>
                  </select>
                </label>
              </div>
            </article>
          </section>
        </section>
      </main>
    </DashboardShell>
  );
}
