"use client";

import { useEffect, useState } from "react";
import { Ban, Check, CircleDashed, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { AuthError } from "@/components/auth/session";
import { usePermission } from "@/components/current-user";
import { cancelBroadcast, formatDuration, getBroadcast, type BroadcastDetail } from "@/components/whatsapp/api";

/** Com a tela aberta, 5s: é a cadência que o backend pediu. */
const LEITURA = 5_000;

/**
 * Acompanhar um envio.
 *
 * A LEITURA É O QUE EMPURRA O ENVIO: cada chamada reconcilia o lote em voo e,
 * quando não há nenhum, despacha o próximo lote de até 100. Por isso este
 * componente relê enquanto o envio está de pé -- e por isso ele diz, na tela,
 * o que acontece se a pessoa fechar.
 */
export function BroadcastMonitor({ id, onClose }: { id: string; onClose: () => void }) {
  const canBroadcast = usePermission("whatsapp.broadcast");
  const [detail, setDetail] = useState<BroadcastDetail | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let timer = 0;

    async function ler() {
      try {
        const atual = await getBroadcast(id);
        if (!vivo) return;
        setDetail(atual);
        setErro(null);
        if (atual.status === "pending" || atual.status === "running") timer = window.setTimeout(ler, LEITURA);
      } catch (error) {
        if (!vivo) return;
        setErro(error instanceof AuthError ? error.message : "Não foi possível acompanhar o envio agora.");
        timer = window.setTimeout(ler, LEITURA * 2);
      }
    }

    void ler();
    return () => { vivo = false; window.clearTimeout(timer); };
  }, [id]);

  async function cancelar() {
    if (canceling) return;
    setCanceling(true);
    try {
      const { status } = await cancelBroadcast(id);
      toast.success(status === "canceled" ? "Envio cancelado. Quem já recebeu, recebeu." : "O envio já havia terminado.");
      setDetail(await getBroadcast(id));
    } catch (error) {
      toast.error(error instanceof AuthError ? error.message : "Não foi possível cancelar.");
    } finally {
      setCanceling(false);
    }
  }

  if (!detail) {
    return <article className="wa-panel is-loading" aria-busy><LoaderCircle className="button-spinner" aria-hidden /><p>Carregando o envio…</p></article>;
  }

  const emCurso = detail.status === "pending" || detail.status === "running";
  const enviados = detail.sentCount + detail.failedCount + detail.skippedCount;
  const progresso = detail.total ? Math.round((enviados / detail.total) * 100) : 0;
  const comProblema = detail.recipients.filter((pessoa) => pessoa.status === "failed" || pessoa.status === "skipped");

  return (
    <article className="wa-panel">
      <header>
        <span aria-hidden className={`wa-state-icon is-${emCurso ? "andamento" : detail.status === "done" ? "ok" : "alerta"}`}>
          {emCurso ? <CircleDashed /> : detail.status === "done" ? <Check /> : <Ban />}
        </span>
        <div>
          <h3>{emCurso ? "Enviando…" : detail.status === "done" ? "Envio concluído" : detail.status === "canceled" ? "Envio cancelado" : "O envio falhou"}</h3>
          <p>{detail.audience === "members" ? "Membros" : "Visitantes"} · {detail.total} {detail.total === 1 ? "pessoa" : "pessoas"}</p>
        </div>
        <button aria-label="Fechar acompanhamento" className="wa-close" onClick={onClose} type="button"><X /></button>
      </header>

      <div className="wa-panel-body">
        <div className="wa-progress" role="progressbar" aria-valuemin={0} aria-valuemax={detail.total} aria-valuenow={enviados}>
          <i style={{ width: `${progresso}%` }} />
        </div>
        <p className="wa-counters">
          <strong>{detail.sentCount}</strong> enviadas · <strong>{detail.failedCount}</strong> com falha ·{" "}
          <strong>{detail.skippedCount}</strong> puladas · <strong>{detail.pendingCount}</strong> na fila
          {emCurso && detail.estimativaSegundos > 0 && <> · restam {formatDuration(detail.estimativaSegundos)}</>}
        </p>

        {emCurso && (
          <p className="wa-note is-info">
            <CircleDashed aria-hidden />
            <span>O envio anda enquanto esta tela está aberta. Fechar não perde ninguém: ele retoma de onde parou quando alguém da igreja voltar aqui.</span>
          </p>
        )}

        {erro && <p className="wa-note"><TriangleAlert aria-hidden /><span>{erro}</span></p>}

        {comProblema.length > 0 && (
          <div className="wa-recipients">
            <h4>Quem não recebeu</h4>
            <ul>
              {comProblema.slice(0, 30).map((pessoa) => (
                <li key={pessoa.id}>
                  <strong>{pessoa.name}</strong>
                  <small>{pessoa.status === "skipped" ? (pessoa.phone ? "cancelado antes de sair" : "sem telefone cadastrado") : pessoa.errorMessage || "falhou no envio"}</small>
                </li>
              ))}
            </ul>
            {comProblema.length > 30 && <small>e mais {comProblema.length - 30}.</small>}
          </div>
        )}

        {emCurso && canBroadcast && (
          <div className="wa-actions">
            <button disabled={canceling} onClick={cancelar} type="button">
              {canceling ? <LoaderCircle className="button-spinner" aria-hidden /> : <Ban aria-hidden />}Cancelar envio
            </button>
            {/* Não existe desfazer no WhatsApp, e a tela não vai fingir que existe. */}
            <small>Cancelar impede quem ainda não recebeu. Quem já recebeu, recebeu.</small>
          </div>
        )}
      </div>
    </article>
  );
}
