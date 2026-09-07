"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { AuthError } from "@/components/auth/session";
import { forwardMessage, listConversations, type Conversation, type Message } from "@/components/whatsapp/api";
import { nomeDe } from "@/components/whatsapp/conversation-list";

/**
 * Para onde encaminhar.
 *
 * UM DESTINO POR VEZ, e o diálogo fecha ao escolher. Não é limitação de tela:
 * vários destinos é envio em massa, que tem teto de 500, intervalo de 3s e
 * permissão própria (`whatsapp.broadcast`). Uma lista com caixinhas de seleção
 * viraria disparo por acúmulo de cliques, sem nenhuma dessas proteções e sem a
 * permissão que as guarda.
 *
 * Só conversas EXISTENTES. A rota também aceita `paraPersonId` e cria a
 * conversa, mas escolher gente do cadastro pediria a listagem de pessoas, que
 * hoje traz a foto em base64 junto -- 8 destinos custariam megabytes para
 * preencher uma lista de nomes.
 */
export function ForwardDialog({
  mensagem,
  origemId,
  onClose,
  onEncaminhada,
}: {
  mensagem: Message;
  origemId: string;
  onClose: () => void;
  onEncaminhada: (destinoId: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [conversas, setConversas] = useState<Conversation[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviandoPara, setEnviandoPara] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement | null>(null);

  useEffect(() => { campo.current?.focus(); }, []);

  useEffect(() => {
    const id = window.setTimeout(async () => {
      setCarregando(true);
      try {
        const dados = await listConversations({ page: 1, pageSize: 25, search: busca });
        // A própria conversa não é destino: encaminhar para onde a mensagem já
        // está não é encaminhar, é reenviar.
        setConversas(dados.records.filter((c) => c.id !== origemId));
      } catch {
        setConversas([]);
      } finally {
        setCarregando(false);
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [busca, origemId]);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => { if (evento.key === "Escape") onClose(); };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onClose]);

  async function encaminhar(destino: Conversation) {
    if (enviandoPara) return;
    setEnviandoPara(destino.id);
    try {
      const { conversationId } = await forwardMessage(origemId, mensagem.waMessageId, destino.id);
      toast.success(`Encaminhada para ${nomeDe(destino)}.`);
      onEncaminhada(conversationId);
      onClose();
    } catch (error) {
      toast.error(error instanceof AuthError ? error.message : "Não foi possível encaminhar a mensagem.");
      setEnviandoPara(null);
    }
  }

  // Portal para o body: o diálogo é `position: fixed`, e ancestral com
  // `transform` faz o fixed medir contra ELE em vez da janela.
  return createPortal(
    <div className="form-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="presentation">
      <div aria-labelledby="wa-encaminhar-titulo" aria-modal className="form-dialog wa-forward" role="dialog">
        <header className="form-dialog-top">
          <div>
            <h2 id="wa-encaminhar-titulo">Encaminhar mensagem</h2>
            {/* O que vai ser enviado, dito antes de escolher para quem. */}
            <p className="wa-forward-trecho">{mensagem.type === "text" ? (mensagem.body ?? mensagem.preview) : mensagem.preview}</p>
          </div>
          <button aria-label="Fechar" onClick={onClose} type="button"><X aria-hidden /></button>
        </header>

        <div className="wa-forward-body">
          <label className="wa-search">
            <Search aria-hidden />
            <input
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Buscar conversa"
              ref={campo}
              type="search"
              value={busca}
            />
          </label>

          {carregando && !conversas.length && <p className="wa-empty">Procurando…</p>}
          {!carregando && !conversas.length && (
            <p className="wa-empty">
              {busca.trim() ? "Nenhuma conversa com esse nome." : "Não há outra conversa para onde encaminhar."}
            </p>
          )}
          <ul className="wa-forward-alvos">
            {conversas.map((conversa) => (
              <li key={conversa.id}>
                <button disabled={Boolean(enviandoPara)} onClick={() => void encaminhar(conversa)} type="button">
                  <strong>{nomeDe(conversa)}</strong>
                  {enviandoPara === conversa.id && <small>Enviando…</small>}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <p className="wa-forward-nota">
          Um destino por vez. Enviar para muita gente de uma vez é o disparo, que tem limite e intervalo próprios.
        </p>
      </div>
    </div>,
    document.body,
  );
}
