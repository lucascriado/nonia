"use client";

import { MessageCircle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { FirstRun } from "@/components/first-run";
import { LoadFailure } from "@/components/load-failure";
import { usePermission } from "@/components/current-user";

/**
 * Aba do WhatsApp.
 *
 * ESQUELETO: a conexão e o envio entram quando o contrato do backend chegar.
 * O que já está aqui é o que não depende dele -- a rota, o título e a guarda
 * de permissão -- para o link do menu não levar a lugar nenhum enquanto isso.
 */
export default function WhatsappPage() {
  const canRead = usePermission("whatsapp.read");

  if (!canRead) return <DashboardShell title="WhatsApp"><main><LoadFailure status={403} /></main></DashboardShell>;

  return (
    <DashboardShell title="WhatsApp">
      <main className="whatsapp-main">
        <section className="resource-heading">
          <div>
            <h2>WhatsApp</h2>
            <p>Conecte o número da igreja e envie mensagens para quem já está cadastrado.</p>
          </div>
        </section>

        <FirstRun
          icon={MessageCircle}
          text="A conexão e o envio em massa entram assim que o contrato do servidor chegar. Esta tela já está no lugar para o menu não levar a lugar nenhum."
          title="Em construção"
        />
      </main>
    </DashboardShell>
  );
}
