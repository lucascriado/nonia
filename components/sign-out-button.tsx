"use client";

import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { toast } from "sonner";
import { logout } from "@/components/auth/session";

/**
 * Sair da conta.
 *
 * Até 06/09/2026 este era um `<a href="#">`: parecia clicável, tinha ícone e
 * rótulo, e não fazia nada. A rota existia desde a Fase 1.
 *
 * SEM GUARDA NENHUMA, de propósito. Sair é a única ação do produto que precisa
 * funcionar quando todo o resto está bloqueado: em somente leitura por
 * mensalidade em aberto, sem permissão nenhuma, com o plano vencido. Quem não
 * consegue sair de uma conta fica preso nela.
 *
 * Recarrega em vez de navegar pelo router: a sessão inteira -- papel,
 * permissões, plano, listagens em memória -- tem que ir embora junto com o
 * cookie. É o mesmo motivo da troca de igreja.
 *
 * Falhando, NÃO manda para /entrar: com o cookie ainda válido a pessoa seria
 * devolvida para o painel e leria isso como "o botão de sair não funciona"
 * outra vez. Melhor dizer que não deu.
 */
export function SignOutButton() {
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    if (leaving) return;
    setLeaving(true);
    try {
      await logout();
      window.location.assign("/entrar");
    } catch {
      toast.error("Não foi possível sair agora. Verifique a conexão e tente de novo.");
      setLeaving(false);
    }
  }

  return (
    <button onClick={signOut} title="Sair da conta" type="button">
      {leaving ? <LoaderCircle className="button-spinner" aria-hidden /> : <LogOut aria-hidden />}
      <span>{leaving ? "Saindo…" : "Sair"}</span>
    </button>
  );
}
