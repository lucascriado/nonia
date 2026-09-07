"use client";

import { useCallback, useEffect, useState } from "react";
import { History, MessageCircle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { FirstRun } from "@/components/first-run";
import { HttpError, LoadFailure } from "@/components/load-failure";
import { usePermission, useReadOnly } from "@/components/current-user";
import { BroadcastComposer } from "@/components/whatsapp/broadcast-composer";
import { BroadcastMonitor } from "@/components/whatsapp/broadcast-monitor";
import { ConnectionPanel } from "@/components/whatsapp/connection-panel";
import { listBroadcasts, type Broadcast, type WhatsappState } from "@/components/whatsapp/api";
import { AuthError } from "@/components/auth/session";
import { ActivitySkeleton } from "@/components/skeleton";

/** O padrão do servidor. Quando o histórico encher, vira paginação. */
const PAGINA = 25;

export default function WhatsappPage() {
  const canRead = usePermission("whatsapp.read");
  const canBroadcast = usePermission("whatsapp.broadcast");
  const readOnly = useReadOnly();
  const [state, setState] = useState<WhatsappState | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<number | null>(null);
  const [acompanhando, setAcompanhando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { records } = await listBroadcasts(1, PAGINA);
      setBroadcasts(records);
      setFailed(null);
    } catch (error) {
      setFailed(error instanceof AuthError ? error.status : error instanceof HttpError ? error.status : 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  if (!canRead) {
    return <DashboardShell title="WhatsApp"><main className="whatsapp-main"><LoadFailure status={403} /></main></DashboardShell>;
  }

  return (
    <DashboardShell title="WhatsApp">
      <main className="whatsapp-main">
        <section className="resource-heading">
          <div>
            <h2>WhatsApp</h2>
            <p>Conecte o número da igreja e envie mensagens para quem já está cadastrado.</p>
          </div>
        </section>

        <div className="whatsapp-content">
          <ConnectionPanel onChange={setState} />

          {acompanhando && <BroadcastMonitor id={acompanhando} onClose={() => { setAcompanhando(null); void carregar(); }} />}

          {/* Disparar é permissão à parte: quem responde uma conversa não
              necessariamente manda para quinhentas pessoas. E a guarda de
              somente leitura também vale -- o servidor recusa com 402. */}
          {canBroadcast && !readOnly && !acompanhando && (
            <BroadcastComposer conectado={Boolean(state?.connected)} onCreated={(id) => { setAcompanhando(id); void carregar(); }} />
          )}

          {canBroadcast && readOnly && (
            <p className="users-readonly">
              <History aria-hidden />
              <span>Enviar mensagens fica indisponível enquanto a conta estiver em somente leitura. Consultar o histórico continua valendo.</span>
            </p>
          )}

          <article className="wa-panel">
            <header>
              <span aria-hidden className="wa-state-icon is-neutro"><History /></span>
              <div>
                <h3>Envios anteriores</h3>
                <p>Tudo o que a igreja já disparou, com o resultado de cada um.</p>
              </div>
            </header>
            <div className="wa-panel-body">
              {loading && <ActivitySkeleton count={3} />}
              {!loading && failed !== null && <LoadFailure onRetry={() => void carregar()} status={failed} />}
              {!loading && failed === null && !broadcasts.length && (
                <FirstRun
                  icon={MessageCircle}
                  text="Quando a igreja disparar a primeira mensagem, ela aparece aqui com quantas saíram, quantas falharam e quem ficou de fora."
                  title="Nenhum envio ainda"
                />
              )}
              {/* Diz que são os mais recentes, e não todos: lista que parece
                  completa e não é tem o mesmo defeito do vazio que mente. A
                  paginação entra quando o histórico encher. */}
              {!loading && failed === null && broadcasts.length >= PAGINA && (
                <p className="wa-history-note">Mostrando os {PAGINA} envios mais recentes.</p>
              )}
              {!loading && failed === null && broadcasts.length > 0 && (
                <ul className="wa-history">
                  {broadcasts.map((envio) => (
                    <li key={envio.id}>
                      <button onClick={() => setAcompanhando(envio.id)} type="button">
                        <span className={`wa-badge is-${envio.status === "done" ? "ok" : envio.status === "running" || envio.status === "pending" ? "andamento" : "alerta"}`}>{rotuloEnvio(envio.status)}</span>
                        <span className="wa-history-text">
                          <strong>{envio.message.slice(0, 90)}{envio.message.length > 90 ? "…" : ""}</strong>
                          <small>
                            {envio.audience === "members" ? "Membros" : "Visitantes"} · {envio.sentCount} de {envio.total} enviadas
                            {envio.failedCount > 0 && ` · ${envio.failedCount} com falha`}
                            {" · "}{formatarData(envio.createdAt)}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        </div>
      </main>
    </DashboardShell>
  );
}

function rotuloEnvio(status: Broadcast["status"]) {
  return { pending: "Na fila", running: "Enviando", done: "Concluído", canceled: "Cancelado", failed: "Falhou" }[status];
}

function formatarData(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}
