"use client";

import { useEffect } from "react";

const preferencesKey = "nonia-app-preferences";

// Só o tema sobrou como preferência: é a única que ainda tem quem a escreva —
// o botão de claro/escuro da topbar. Escala de fonte e idioma saíram junto com
// o cartão "Preferências do Sistema"; sem tela que as gravasse, seriam estado
// morto no localStorage.
type Preferences = { theme?: "light" | "dark" };

export function readPreferences(): Required<Preferences> {
  if (typeof window === "undefined") return { theme: "light" };
  try {
    const stored = JSON.parse(window.localStorage.getItem(preferencesKey) || "{}");
    return { theme: stored.theme === "dark" ? "dark" : "light" };
  } catch {
    return { theme: "light" };
  }
}

export function savePreferences(preferences: Preferences) {
  const next = { ...readPreferences(), ...preferences };
  window.localStorage.setItem(preferencesKey, JSON.stringify(next));
  applyPreferences(next);
  return next;
}

function applyPreferences(preferences: Required<Preferences>) {
  document.documentElement.dataset.theme = preferences.theme;
}

export function AppPreferences() {
  useEffect(() => {
    applyPreferences(readPreferences());
  }, []);

  return null;
}
