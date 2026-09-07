"use client";

import { Search, Users } from "lucide-react";
import { ActivitySkeleton } from "@/components/skeleton";
import type { Conversation, InboxSync } from "@/components/whatsapp/api";

/**
 * A coluna da esquerda: as conversas, ordenadas por última atividade.
 *
 * Ela é BURRA de propósito — quem busca, pagina e sincroniza é a caixa
 * (`inbox.tsx`), porque o estado da sincronização também governa a faixa do
 * topo e a coluna da direita. Dois donos do mesmo `fetch` foi como a listagem
 * de membros ganhou o piscar do vazio.
 */
export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  search,
  onSearch,
  unreadOnly,
  onUnreadOnly,
  loading,
  refreshing,
  total,
  sync,
  connected,
  onLoadMore,
  loadingMore,
}: {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (valor: string) => void;
  unreadOnly: boolean;
  onUnreadOnly: (valor: boolean) => void;
  loading: boolean;
  refreshing: boolean;
  total: number;
  sync: InboxSync | null;
  connected: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
}) {
  const filtrando = Boolean(search.trim()) || unreadOnly;
  const faltam = total - conversations.length;

  return (
    <div className="wa-list" aria-busy={refreshing || undefined}>
      <div className="wa-list-controls">
        <label className="wa-search">
          <Search aria-hidden />
          <input
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar por nome ou número"
            type="search"
            value={search}
          />
        </label>
        <button
          aria-pressed={unreadOnly}
          className={`wa-chip${unreadOnly ? " is-on" : ""}`}
          onClick={() => onUnreadOnly(!unreadOnly)}
          type="button"
        >
          Só não lidas
        </button>
      </div>

      <div className={`wa-list-body${refreshing ? " is-refreshing" : ""}`}>
        {/* Esqueleto SÓ quando não há nada para manter na tela. Trocar de
            filtro com a lista carregada mantém a lista e escurece; era o
            piscar do vazio que a listagem de membros tinha. */}
        {loading && !conversations.length && <ActivitySkeleton count={6} />}

        {!loading && !conversations.length && (
          <ListaVazia connected={connected} filtrando={filtrando} sync={sync} />
        )}

        {conversations.length > 0 && (
          <ul className="wa-conversations">
            {conversations.map((conversa) => (
              <li key={conversa.id}>
                <button
                  aria-current={conversa.id === selectedId || undefined}
                  className={`wa-conversation${conversa.id === selectedId ? " is-active" : ""}`}
                  onClick={() => onSelect(conversa.id)}
                  type="button"
                >
                  <span className="wa-conversation-top">
                    <strong>{nomeDe(conversa)}</strong>
                    <small>{quando(conversa.lastMessageAt)}</small>
                  </span>
                  <span className="wa-conversation-bottom">
                    <span className="wa-conversation-preview">
                      {/* Prévia vazia NÃO é o mesmo que conversa sem mensagem, e a
                          lista não sabe distinguir: `last_message_preview` vem do
                          campo cru do chat e não passa pelo cálculo de prévia do
                          servidor, então mídia como última mensagem chega em
                          branco aqui e como "[foto]" lá dentro. Afirmar "sem
                          mensagens" seria mentir para esse caso; o marcador entre
                          colchetes não afirma nada e segue a convenção da casa. */}
                      {conversa.preview?.trim() || "[sem prévia]"}
                    </span>
                    {conversa.unreadCount > 0 && (
                      <span aria-label={`${conversa.unreadCount} não ${conversa.unreadCount === 1 ? "lida" : "lidas"}`} className="wa-unread">
                        {conversa.unreadCount > 99 ? "99+" : conversa.unreadCount}
                      </span>
                    )}
                  </span>
                  {(conversa.kind === "group" || foraDoCadastro(conversa)) && (
                    <span className="wa-conversation-tags">
                      {conversa.kind === "group" && (
                        <span className="wa-tag"><Users aria-hidden />Grupo</span>
                      )}
                      {/* A vantagem que o WhatsApp puro não tem: dizer quem do
                          cadastro é. O contrário também informa. */}
                      {foraDoCadastro(conversa) && <span className="wa-tag">Fora do cadastro</span>}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {faltam > 0 && (
          <button className="wa-load-more" disabled={loadingMore} onClick={onLoadMore} type="button">
            {loadingMore ? "Carregando…" : `Carregar mais ${faltam > 25 ? 25 : faltam}`}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * O vazio, e as quatro razões diferentes de ele estar vazio.
 *
 * "Nenhuma conversa" é a ÚNICA que afirma ausência, e só vale com a
 * sincronização terminada. As outras três dizem o que está acontecendo — e a de
 * progresso vem com denominador, porque "trazendo…" sozinho é uma ampulheta.
 */
function ListaVazia({
  connected,
  filtrando,
  sync,
}: {
  connected: boolean;
  filtrando: boolean;
  sync: InboxSync | null;
}) {
  if (filtrando) {
    return <p className="wa-empty">Nenhuma conversa com esse filtro. Limpe a busca para ver todas.</p>;
  }
  if (!connected) {
    return <p className="wa-empty">As conversas aparecem aqui depois que o WhatsApp da igreja for conectado.</p>;
  }
  if (!sync || sync.state === "never_synced") {
    return <p className="wa-empty">As conversas ainda não foram trazidas. Isso acontece na primeira vez que esta tela abre.</p>;
  }
  if (sync.state === "syncing") {
    return (
      <p className="wa-empty">
        Trazendo as conversas: <strong>{sync.chatsSincronizados} de {sync.chatsConhecidos}</strong>. Elas vão aparecendo
        conforme chegam.
      </p>
    );
  }
  return <p className="wa-empty">Nenhuma conversa neste número ainda.</p>;
}

/**
 * Grupo NUNCA é uma pessoa do cadastro, então dizer que ele está fora dele não
 * informa nada -- só repete a etiqueta "Grupo" com outras palavras. O servidor
 * manda `naoIdentificado` true para todo grupo porque a coluna é um LEFT JOIN
 * que não casou, e está certo do lado dele; quem decide se aquilo merece
 * etiqueta é a tela.
 */
export function foraDoCadastro(conversa: Conversation) {
  return conversa.naoIdentificado && conversa.kind !== "group";
}

export function nomeDe(conversa: Conversation) {
  // Sem nome do cadastro e sem nome do WhatsApp sobra o número; sem número
  // (grupo, ou contato @lid) sobra dizer isso, e não um espaço em branco.
  return conversa.name?.trim() || formatarTelefone(conversa.phone) || "Sem nome";
}

/** `5511988881111` → `+55 11 98888-1111`. Só quando o formato é o esperado. */
export function formatarTelefone(numero: string | null) {
  if (!numero) return null;
  const m = numero.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]}-${m[4]}` : numero;
}

const DIA = 86_400_000;

/** Hoje mostra a hora; ontem diz "Ontem"; a semana diz o dia; o resto, a data. */
function quando(iso: string | null) {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  // Conversa sem nenhuma mensagem chega com a data da época (`to_timestamp(0)`)
  // e virava "31/12/69" na lista -- uma data que a conversa não tem. O WhatsApp
  // não existia antes de 2000, então tempo anterior a isso é valor AUSENTE, e
  // ausente não se carimba com um dia.
  if (data.getUTCFullYear() < 2000) return "";
  const hoje = new Date();
  const meiaNoite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  const inicio = new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime();
  if (inicio === meiaNoite) return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (inicio === meiaNoite - DIA) return "Ontem";
  if (meiaNoite - inicio < 6 * DIA) return data.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
