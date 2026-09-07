"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Plug, PlugZap, QrCode, RefreshCw, ShieldAlert, Smartphone, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AuthError } from "@/components/auth/session";
import { usePermission } from "@/components/current-user";
import {
  createWhatsappSession,
  disconnectWhatsapp,
  getWhatsappQr,
  getWhatsappState,
  type WhatsappState,
  type WhatsappStatus,
} from "@/components/whatsapp/api";

/** Enquanto não é `ready`, o QR é relido a cada 10s: o Baileys gira ele a cada 20 a 60. */
const QR_INTERVALO = 10_000;

const EM_ANDAMENTO: WhatsappStatus[] = ["created", "initializing", "qr_ready", "authenticating"];

export function ConnectionPanel({ onChange }: { onChange?: (state: WhatsappState) => void }) {
  const canWrite = usePermission("whatsapp.write");
  const [state, setState] = useState<WhatsappState | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState<number | null>(null);
  const aoMudar = useRef(onChange);
  aoMudar.current = onChange;

  const ler = useCallback(async () => {
    try {
      const atual = await getWhatsappState();
      setState(atual);
      setFailed(null);
      aoMudar.current?.(atual);
      return atual;
    } catch (error) {
      setFailed(error instanceof AuthError ? error.status : 0);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void ler(); }, [ler]);

  // Enquanto o pareamento está em curso, é o GET do QR que manda: ele traz o
  // código novo E é por ele que a tela descobre que conectou.
  useEffect(() => {
    if (!state || !EM_ANDAMENTO.includes(state.status)) { setQr(null); return; }
    let vivo = true;
    async function puxar() {
      try {
        const resposta = await getWhatsappQr();
        if (!vivo) return;
        setQr(resposta.qr);
        if (resposta.connected || resposta.status !== state!.status) void ler();
      } catch {
        // Um QR que falhou não derruba a tela: a próxima leitura tenta de novo.
      }
    }
    void puxar();
    const id = window.setInterval(puxar, QR_INTERVALO);
    return () => { vivo = false; window.clearInterval(id); };
  }, [ler, state]);

  async function conectar() {
    if (working) return;
    setWorking(true);
    try {
      await createWhatsappSession();
      await ler();
    } catch (error) {
      toast.error(error instanceof AuthError ? error.message : "Não foi possível iniciar a conexão.");
    } finally {
      setWorking(false);
    }
  }

  async function desconectar() {
    if (working) return;
    setWorking(true);
    try {
      await disconnectWhatsapp();
      toast.success("WhatsApp desconectado. O histórico de envios continua aqui.");
      await ler();
    } catch (error) {
      toast.error(error instanceof AuthError ? error.message : "Não foi possível desconectar.");
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return <article className="wa-panel is-loading" aria-busy><LoaderCircle className="button-spinner" aria-hidden /><p>Verificando a conexão…</p></article>;
  }

  if (failed !== null || !state) {
    return (
      <article className="wa-panel">
        <div className="wa-panel-body">
          <p className="wa-note"><TriangleAlert aria-hidden /><span>Não foi possível verificar a conexão do WhatsApp agora. Isso costuma ser conexão; tente de novo em instantes.</span></p>
          <button className="primary-action" onClick={() => { setLoading(true); void ler(); }} type="button"><RefreshCw aria-hidden />Tentar de novo</button>
        </div>
      </article>
    );
  }

  return (
    <article className="wa-panel">
      <header>
        <span aria-hidden className={`wa-state-icon is-${estadoVisual(state)}`}>{state.connected ? <PlugZap /> : state.status === "not_configured" ? <ShieldAlert /> : <Plug />}</span>
        <div>
          <h3>{titulo(state)}</h3>
          <p>{descricao(state)}</p>
        </div>
        <span className={`wa-badge is-${estadoVisual(state)}`}>{rotulo(state)}</span>
      </header>

      <div className="wa-panel-body">
        {/* `stale` é o servidor dizendo "não consegui confirmar agora". Mostrar
            o último fato conhecido sem essa ressalva seria afirmar como atual
            uma coisa que ninguém acabou de ler. */}
        {state.stale && (
          <p className="wa-note"><TriangleAlert aria-hidden /><span>Este é o último estado conhecido: o serviço do WhatsApp não respondeu à última verificação.</span></p>
        )}

        {state.connected && (
          <>
            <dl className="wa-facts">
              <div><dt>Número</dt><dd>{state.phone || "não informado"}</dd></div>
              {state.pushName && <div><dt>Nome no WhatsApp</dt><dd>{state.pushName}</dd></div>}
              {state.connectedAt && <div><dt>Conectado desde</dt><dd>{formatarData(state.connectedAt)}</dd></div>}
            </dl>
            {/* A EXPECTATIVA DE QUEM CONECTA É VER AS CONVERSAS. Hoje conectar
                habilita só o envio. Dizer isso aqui é o que separa esta tela de
                um estado vazio que mente. */}
            <p className="wa-note is-info">
              <Smartphone aria-hidden />
              <span>
                Com o número conectado você já pode <strong>enviar mensagens em massa</strong> para quem tem telefone
                cadastrado. <strong>Ler e responder conversas ainda não existe</strong> nesta tela — é o próximo bloco, e
                está sendo construído.
              </span>
            </p>
          </>
        )}

        {qr && (
          <div className="wa-qr">
            <img alt="Código QR para conectar o WhatsApp" src={qr} />
            <ol>
              <li>Abra o WhatsApp no celular da igreja.</li>
              <li>Toque em <strong>Aparelhos conectados</strong> e depois em <strong>Conectar um aparelho</strong>.</li>
              <li>Aponte a câmera para este código.</li>
            </ol>
            <small>O código muda sozinho a cada poucos segundos. Não precisa recarregar a página.</small>
          </div>
        )}

        {!qr && EM_ANDAMENTO.includes(state.status) && (
          <p className="wa-note"><LoaderCircle className="button-spinner" aria-hidden /><span>Preparando o código de conexão…</span></p>
        )}

        {canWrite && (
          <div className="wa-actions">
            {state.status === "not_configured" ? null : state.connected ? (
              <button disabled={working} onClick={desconectar} type="button">
                {working ? <LoaderCircle className="button-spinner" aria-hidden /> : <Plug aria-hidden />}Desconectar
              </button>
            ) : EM_ANDAMENTO.includes(state.status) ? null : (
              <button className="primary-action" disabled={working} onClick={conectar} type="button">
                {working ? <LoaderCircle className="button-spinner" aria-hidden /> : <QrCode aria-hidden />}
                {state.status === "not_connected" ? "Conectar o WhatsApp da igreja" : "Gerar novo código"}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** Três aparências: conectado, em curso, e o resto. */
function estadoVisual(state: WhatsappState) {
  if (state.connected) return "ok";
  if (EM_ANDAMENTO.includes(state.status)) return "andamento";
  return state.status === "not_configured" || state.status === "not_connected" ? "neutro" : "alerta";
}

function titulo(state: WhatsappState) {
  if (state.status === "not_configured") return "WhatsApp indisponível neste ambiente";
  if (state.connected) return "WhatsApp conectado";
  if (state.status === "not_connected") return "Conecte o WhatsApp da igreja";
  if (state.status === "failed") return "A conexão falhou";
  if (state.status === "disconnected") return "O WhatsApp caiu";
  return "Conectando…";
}

function descricao(state: WhatsappState) {
  switch (state.status) {
    case "not_configured":
      return "O servidor deste ambiente não tem a integração ligada. Não há nada a fazer por aqui.";
    case "not_connected":
      return "Leia o código com o celular da igreja para começar a enviar mensagens.";
    case "ready":
      return "As mensagens saem pelo número abaixo.";
    case "failed":
      return "Não dá para retomar de onde parou: gere um código novo e leia de novo.";
    case "disconnected":
      return "Enquanto estiver assim, nenhuma mensagem sai — o envio é recusado na hora, não fica esperando.";
    default:
      return "Leia o código com o celular da igreja. Isto costuma levar alguns segundos.";
  }
}

function rotulo(state: WhatsappState) {
  if (state.status === "not_configured") return "Indisponível";
  if (state.connected) return "Conectado";
  if (EM_ANDAMENTO.includes(state.status)) return "Conectando";
  if (state.status === "failed") return "Falhou";
  if (state.status === "disconnected") return "Desconectado";
  return "Sem conexão";
}

function formatarData(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
}
