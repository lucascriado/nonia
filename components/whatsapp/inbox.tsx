"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, PlugZap } from "lucide-react";
import { AuthError } from "@/components/auth/session";
import { HttpError, LoadFailure } from "@/components/load-failure";
import { usePermission, useReadOnly } from "@/components/current-user";
import { ConversationList } from "@/components/whatsapp/conversation-list";
import { ConversationView } from "@/components/whatsapp/conversation-view";
import { useConversationPhotos } from "@/components/whatsapp/use-photos";
import { listConversations, type Conversation, type InboxSync } from "@/components/whatsapp/api";

const PAGINA = 25;
/** Parado, olhar a cada 25s basta. */
const RITMO = 25_000;
/** Sincronizando, cada leitura empurra mais três: olhar de perto ADIANTA. */
const RITMO_SYNC = 5_000;
const ESPERA_BUSCA = 300;

/**
 * A caixa de entrada: conversas à esquerda, a conversa aberta à direita.
 *
 * Quem lê é quem sincroniza — o projeto não tem tarefa agendada, então este
 * laço é o que faz a caixa andar. Por isso ele acelera enquanto há conversa
 * faltando e desacelera quando termina, e para quando ninguém está olhando.
 */
export function Inbox({ onIrParaConexao }: { onIrParaConexao: () => void }) {
  const canWrite = usePermission("whatsapp.write");
  const readOnly = useReadOnly();

  const [conversas, setConversas] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [sync, setSync] = useState<InboxSync | null>(null);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [failed, setFailed] = useState<number | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [soNaoLidas, setSoNaoLidas] = useState(false);

  // Cada leitura leva um número. Resposta de um pedido velho que chega depois
  // de a pergunta ter mudado é DESCARTADA -- sem isso, trocar o filtro no meio
  // de uma leitura em curso deixaria na tela o resultado da pergunta anterior.
  const pedido = useRef(0);
  const paginaCarregada = useRef(1);

  // Digitar não dispara uma requisição por tecla — e, mais importante, não
  // esvazia a lista entre uma tecla e outra.
  useEffect(() => {
    const id = window.setTimeout(() => setBuscaAplicada(busca), ESPERA_BUSCA);
    return () => window.clearTimeout(id);
  }, [busca]);

  /**
   * Traz a primeira página e FUNDE com o que já está carregado.
   *
   * Funde, e não substitui, porque quem carregou cinco páginas não pode
   * perder quatro delas só porque o relógio bateu. A ordenação é a mesma do
   * servidor — última atividade primeiro —, então refazê-la aqui devolve
   * exatamente a lista que o servidor devolveria.
   */
  const atualizar = useCallback(async ({ silencioso, substituir }: { silencioso: boolean; substituir: boolean }) => {
    const meu = ++pedido.current;
    if (!silencioso) setLoading(true);
    try {
      const dados = await listConversations({
        page: 1,
        pageSize: PAGINA,
        search: buscaAplicada,
        unread: soNaoLidas,
      });
      if (meu !== pedido.current) return;
      // Filtro novo SUBSTITUI: fundir traria de volta conversas que não casam
      // com a pergunta atual. Atualização de relógio funde, porque a pergunta
      // é a mesma e quem carregou cinco páginas não pode perder quatro.
      setConversas((atuais) => ordenar(substituir ? dados.records : fundir(atuais, dados.records)));
      setTotal(dados.total);
      setSync(dados.sync);
      setConnected(dados.connected);
      setFailed(null);
    } catch (error) {
      if (meu !== pedido.current) return;
      setFailed(error instanceof AuthError ? error.status : error instanceof HttpError ? error.status : 0);
    } finally {
      if (meu === pedido.current) setLoading(false);
    }
  }, [buscaAplicada, soNaoLidas]);

  // Filtro novo recomeça a paginação -- mas NÃO esvazia a lista antes da
  // resposta. Esvaziar faria a tela piscar "nenhuma conversa" a cada tecla
  // digitada, que é o defeito que as listagens já tiveram. A lista antiga fica
  // esmaecida até a nova chegar, e aí é substituída.
  useEffect(() => {
    paginaCarregada.current = 1;
    void atualizar({ silencioso: false, substituir: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaAplicada, soNaoLidas]);

  useEffect(() => {
    const intervalo = sync?.state === "syncing" ? RITMO_SYNC : RITMO;
    const tique = () => {
      if (document.visibilityState === "visible") void atualizar({ silencioso: true, substituir: false });
    };
    const relogio = window.setInterval(tique, intervalo);
    document.addEventListener("visibilitychange", tique);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", tique);
    };
  }, [atualizar, sync?.state]);

  async function carregarMais() {
    setCarregandoMais(true);
    try {
      const proxima = paginaCarregada.current + 1;
      const dados = await listConversations({
        page: proxima,
        pageSize: PAGINA,
        search: buscaAplicada,
        unread: soNaoLidas,
      });
      paginaCarregada.current = proxima;
      setConversas((atuais) => ordenar(fundir(atuais, dados.records)));
      setTotal(dados.total);
    } catch {
      // O botão volta a ficar disponível; a lista que já está na tela continua.
    } finally {
      setCarregandoMais(false);
    }
  }

  if (failed !== null && !conversas.length) {
    return <LoadFailure onRetry={() => void atualizar({ silencioso: false, substituir: true })} status={failed} />;
  }

  // Fotos numa segunda requisição, DEPOIS que `conversas` já está em tela com
  // iniciais. A conversa aberta pega a foto do mesmo mapa.
  const fotos = useConversationPhotos(conversas);
  const conversaAberta = selecionada ? conversas.find((c) => c.id === selecionada) : null;

  return (
    <div className="wa-inbox-wrap">
      {/* A caixa não finge que existe conversa sem conexão, e o caminho de
          conectar fica a um clique — não escondido atrás de outra aba. */}
      {!connected && (
        <p className="wa-thread-warning" role="status">
          <PlugZap aria-hidden />
          <span>O WhatsApp da igreja não está conectado. Nada entra e nada sai enquanto estiver assim.</span>
          <button className="wa-inline-action" onClick={onIrParaConexao} type="button">Conectar</button>
        </p>
      )}

      {/* `is-open` existe para o celular, onde as duas colunas não cabem lado a
          lado: ou a lista, ou a conversa. */}
      <div className={`wa-inbox${selecionada ? " is-open" : ""}`}>
        <ConversationList
          connected={connected}
          conversations={conversas}
          fotos={fotos}
          loading={loading}
          loadingMore={carregandoMais}
          onLoadMore={() => void carregarMais()}
          onSearch={setBusca}
          onSelect={setSelecionada}
          onUnreadOnly={setSoNaoLidas}
          refreshing={loading && conversas.length > 0}
          search={busca}
          selectedId={selecionada}
          sync={sync}
          total={total}
          unreadOnly={soNaoLidas}
        />

        <div className="wa-pane">
          {selecionada ? (
            <ConversationView
              canWrite={canWrite}
              id={selecionada}
              key={selecionada}
              onBack={() => setSelecionada(null)}
              onChanged={() => void atualizar({ silencioso: true, substituir: false })}
              photoUrl={conversaAberta ? fotos[conversaAberta.chatId] : null}
              readOnly={readOnly}
            />
          ) : (
            <div className="wa-pane-idle">
              <MessageCircle aria-hidden />
              <p>Escolha uma conversa à esquerda para ler e responder.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Mesma conversa vinda de novo substitui a antiga; o resto continua. */
function fundir(atuais: Conversation[], novas: Conversation[]) {
  const mapa = new Map(atuais.map((c) => [c.id, c]));
  for (const nova of novas) mapa.set(nova.id, nova);
  return [...mapa.values()];
}

/** A ordem do servidor: última atividade primeiro, sem data por último. */
function ordenar(lista: Conversation[]) {
  return lista.sort((a, b) => {
    if (!a.lastMessageAt) return 1;
    if (!b.lastMessageAt) return -1;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });
}
