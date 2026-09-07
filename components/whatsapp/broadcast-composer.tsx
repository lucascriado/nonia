"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Search, Send, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { AuthError } from "@/components/auth/session";
import {
  createBroadcast,
  formatDuration,
  previewBroadcast,
  type BroadcastAudience,
  type BroadcastFilters,
  type BroadcastPreview,
} from "@/components/whatsapp/api";

const MENSAGEM_MAX = 4096;

/**
 * Compor e disparar um envio.
 *
 * A SELEÇÃO É O FILTRO, com os mesmos nomes de parâmetro das listagens -- o
 * servidor passa `filters` para o mesmo `filtrosDeMembros`/`filtrosDeVisitantes`
 * que a listagem e a exportação usam. "Envia para quem você está vendo" não
 * depende de espelho mantido à mão.
 *
 * A CONFERÊNCIA VEM ANTES DE CONFIRMAR, e ela é barata: `preview:true` não
 * exige mensagem, não exige WhatsApp conectado e não grava nada. Por isso ela
 * roda a cada mudança de filtro, e não só no clique.
 */
export function BroadcastComposer({ conectado, onCreated }: { conectado: boolean; onCreated: (id: string) => void }) {
  const [audience, setAudience] = useState<BroadcastAudience>("members");
  const [filters, setFilters] = useState<BroadcastFilters>({});
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [previewing, setPreviewing] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [ministries, setMinistries] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/ministries", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => payload && setMinistries((payload.ministries ?? payload).map((item: { name: string }) => item.name)))
      .catch(() => undefined);
  }, []);

  const conferir = useCallback(async (proximoPublico: BroadcastAudience, proximosFiltros: BroadcastFilters) => {
    setPreviewing(true);
    try {
      const { preview: resultado } = await previewBroadcast({ audience: proximoPublico, filters: proximosFiltros });
      setPreview(resultado);
    } catch {
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void conferir(audience, filters), filters.search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [audience, conferir, filters]);

  function trocarPublico(proximo: BroadcastAudience) {
    setAudience(proximo);
    // Os filtros de membro não existem em visitante e vice-versa: manter um
    // deles ao trocar mandaria ao servidor um recorte que a tela não mostra.
    setFilters({});
    setConfirming(false);
  }

  function ajustar(campo: string, valor: string) {
    setFilters((atuais) => {
      const proximos = { ...atuais };
      if (valor && valor !== "all") proximos[campo] = valor;
      else delete proximos[campo];
      return proximos;
    });
    setConfirming(false);
  }

  async function enviar() {
    if (sending) return;
    setSending(true);
    try {
      const criado = await createBroadcast({ audience, message: message.trim(), filters });
      toast.success("Envio criado. Acompanhe abaixo.");
      onCreated(criado.id);
      setMessage("");
      setConfirming(false);
    } catch (error) {
      toast.error(error instanceof AuthError ? error.message : "Não foi possível criar o envio.");
    } finally {
      setSending(false);
    }
  }

  const semDestinatario = preview !== null && preview.comTelefone === 0;
  const podeConfirmar = conectado && !semDestinatario && message.trim().length > 0 && message.length <= MENSAGEM_MAX;
  const acimaDe100 = (preview?.comTelefone ?? 0) > 100;

  return (
    <article className="wa-panel">
      <header>
        <span aria-hidden className="wa-state-icon is-neutro"><Send /></span>
        <div>
          <h3>Enviar mensagem em massa</h3>
          <p>Escolha quem recebe pelos mesmos filtros das listagens e escreva a mensagem.</p>
        </div>
      </header>

      <div className="wa-panel-body">
        <div className="wa-audience" role="group" aria-label="Quem recebe">
          <button aria-pressed={audience === "members"} className={audience === "members" ? "active" : undefined} onClick={() => trocarPublico("members")} type="button">Membros</button>
          <button aria-pressed={audience === "visitors"} className={audience === "visitors" ? "active" : undefined} onClick={() => trocarPublico("visitors")} type="button">Visitantes</button>
        </div>

        <div className="member-filters wa-filters">
          <label className="member-filter-search">
            <Search aria-hidden />
            <input onChange={(event) => ajustar("search", event.target.value)} placeholder="Filtrar por nome..." value={filters.search ?? ""} />
          </label>
          {audience === "members" ? (
            <>
              <select aria-label="Filtrar por ministério" onChange={(event) => ajustar("ministry", event.target.value)} value={filters.ministry ?? "all"}>
                <option value="all">Todos os Ministérios</option>
                {ministries.map((item) => <option key={item}>{item}</option>)}
              </select>
              <select aria-label="Filtrar por status" onChange={(event) => ajustar("status", event.target.value)} value={filters.status ?? "all"}>
                <option value="all">Status: Todos</option><option>Ativo</option><option>Inativo</option>
              </select>
              <select aria-label="Filtrar por batismo" onChange={(event) => ajustar("baptism", event.target.value)} value={filters.baptism ?? "all"}>
                <option value="all">Batismo: Todos</option><option>Batizado</option><option>Aguardando</option>
              </select>
            </>
          ) : (
            <select aria-label="Filtrar por etapa" onChange={(event) => ajustar("tab", event.target.value)} value={filters.tab ?? "Todos"}>
              <option>Todos</option><option>Recentes</option><option>Pendentes</option>
            </select>
          )}
        </div>

        {/* OS DOIS NÚMEROS ANTES DE QUALQUER COISA. Quem não tem telefone é
            fato de agora, não falha depois do envio. */}
        <div className="wa-preview" aria-live="polite">
          <Users aria-hidden />
          {previewing && !preview ? (
            <span>Conferindo quem entra…</span>
          ) : preview ? (
            <span>
              De <strong>{preview.total}</strong> {audience === "members" ? "membros" : "visitantes"} nesse filtro,{" "}
              <strong>{preview.comTelefone}</strong> {preview.comTelefone === 1 ? "tem telefone" : "têm telefone"}
              {preview.semTelefone > 0 && <> e {preview.semTelefone} {preview.semTelefone === 1 ? "ficará de fora" : "ficarão de fora"}</>}.
              {preview.comTelefone > 0 && <> O envio leva <strong>{formatDuration(preview.estimativaSegundos)}</strong>.</>}
            </span>
          ) : (
            <span>Não foi possível conferir quem entra agora.</span>
          )}
        </div>

        {preview?.acimaDoTeto && (
          <p className="wa-note"><TriangleAlert aria-hidden /><span>O limite é de {preview.teto} pessoas por envio. Este vai para as {preview.teto} primeiras; para alcançar o resto, filtre e faça um segundo envio.</span></p>
        )}

        {semDestinatario && (
          <p className="wa-note"><TriangleAlert aria-hidden /><span>Ninguém nesse filtro tem telefone cadastrado, então não há para quem enviar. O telefone entra na ficha da pessoa.</span></p>
        )}

        <label className="wa-message">
          <span>Mensagem</span>
          <textarea
            maxLength={MENSAGEM_MAX}
            onChange={(event) => { setMessage(event.target.value); setConfirming(false); }}
            placeholder="Escreva como você escreveria no WhatsApp."
            rows={5}
            value={message}
          />
          <small>{message.length} de {MENSAGEM_MAX} caracteres</small>
        </label>

        {!conectado && (
          <p className="wa-note"><TriangleAlert aria-hidden /><span>O WhatsApp precisa estar conectado para enviar. Enquanto não estiver, o envio é recusado na hora — ele não fica esperando.</span></p>
        )}

        {confirming ? (
          <div className="wa-confirm">
            <p>
              Enviar para <strong>{preview?.comTelefone}</strong> {preview?.comTelefone === 1 ? "pessoa" : "pessoas"},{" "}
              {formatDuration(preview?.estimativaSegundos ?? 0)}.
            </p>
            {/* Acima de 100 o envio anda em blocos e pausa na virada se ninguém
                olha. Dizer isso antes é a diferença entre a pessoa fechar a aba
                sabendo e descobrir depois. */}
            {acimaDe100 && <p className="wa-confirm-note">O envio continua enquanto esta tela estiver aberta. Se você fechar, ele retoma quando alguém da igreja voltar aqui.</p>}
            <div className="wa-actions">
              <button disabled={sending} onClick={() => setConfirming(false)} type="button">Voltar</button>
              <button aria-busy={sending} className="primary-action" disabled={sending} onClick={enviar} type="button">
                {sending ? <LoaderCircle className="button-spinner" aria-hidden /> : <Send aria-hidden />}
                {sending ? "Criando envio…" : "Confirmar envio"}
              </button>
            </div>
          </div>
        ) : (
          <div className="wa-actions">
            <button className="primary-action" disabled={!podeConfirmar} onClick={() => setConfirming(true)} type="button">
              <Send aria-hidden />Revisar e enviar
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
