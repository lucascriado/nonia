"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CloudOff, CornerUpLeft, Forward, Paperclip, Send, Users, X } from "lucide-react";
import { toast } from "sonner";
import { AuthError } from "@/components/auth/session";
import { READ_ONLY_REASON } from "@/components/current-user";
import { HttpError, LoadFailure } from "@/components/load-failure";
import { ActivitySkeleton } from "@/components/skeleton";
import { foraDoCadastro, formatarTelefone, nomeDe } from "@/components/whatsapp/conversation-list";
import { WaAvatar } from "@/components/whatsapp/wa-avatar";
import { ForwardDialog } from "@/components/whatsapp/forward-dialog";
import { MessageMedia } from "@/components/whatsapp/message-media";
import {
  LIMITE_ARQUIVO,
  LIMITE_LEGENDA,
  LIMITE_MENSAGEM,
  getConversation,
  replyToConversation,
  sendMedia,
  type ConversationDetail,
  type Message,
} from "@/components/whatsapp/api";

/** De quanto em quanto tempo a conversa aberta se atualiza. */
const RITMO = 10_000;
/** O teto por leitura da rota: `hasMore` sai de comparar com isto. */
const RASO = 100;
const FUNDO = 500;

/**
 * A conversa aberta: o histórico e o campo de resposta.
 *
 * Abrir É o que sincroniza e É o que zera o não-lido — não há rota de "marcar
 * como lida", e por isso também não existe "marcar como não lida" na tela: o
 * botão precisaria de uma rota que ninguém escreveu.
 */
export function ConversationView({
  id,
  canWrite,
  readOnly,
  onBack,
  onChanged,
  photoUrl,
}: {
  id: string;
  canWrite: boolean;
  readOnly: boolean;
  onBack: () => void;
  onChanged: () => void;
  /** Foto do contato desta conversa, vinda da caixa (mesma fonte da lista). */
  photoUrl?: string | null;
}) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<number | null>(null);
  const [deep, setDeep] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  /** A mensagem que a resposta vai CITAR, quando houver. */
  const [citando, setCitando] = useState<Message | null>(null);
  /** A mensagem que o diálogo de encaminhar está segurando. */
  const [encaminhando, setEncaminhando] = useState<Message | null>(null);
  const arquivo = useRef<HTMLInputElement | null>(null);
  const campo = useRef<HTMLTextAreaElement | null>(null);
  const fim = useRef<HTMLDivElement | null>(null);
  const emVoo = useRef(false);
  // Se já há histórico na tela, uma leitura de fundo que falha NÃO pode
  // apagá-lo. Vai por ref e não pela variável de estado porque o laço do
  // relógio guarda o fecho da primeira renderização, onde `detail` é null --
  // e aí a falha silenciosa passaria a derrubar a conversa inteira.
  const temHistorico = useRef(false);
  // O primeiro carregamento de cada conversa avisa a lista, porque abrir zerou
  // o não-lido do lado do servidor e o contador na esquerda ficaria mentindo.
  const avisou = useRef<string | null>(null);

  const carregar = useCallback(
    async (fundo: boolean, silencioso: boolean) => {
      // A trava só vale para o relógio. Se ela valesse para o clique, pedir as
      // mensagens antigas no instante em que uma leitura de fundo está em voo
      // não faria nada -- e o botão pareceria quebrado por 10 segundos.
      if (silencioso && emVoo.current) return;
      emVoo.current = true;
      if (!silencioso) setLoading(true);
      try {
        const dados = await getConversation(id, fundo);
        setDetail(dados);
        temHistorico.current = true;
        setFailed(null);
        if (avisou.current !== id) {
          avisou.current = id;
          onChanged();
        }
      } catch (error) {
        // Falha na atualização de fundo NÃO apaga o que já está na tela: o
        // histórico continua sendo o último fato conhecido.
        if (!silencioso || !temHistorico.current) {
          setFailed(error instanceof AuthError ? error.status : error instanceof HttpError ? error.status : 0);
        }
      } finally {
        emVoo.current = false;
        setLoading(false);
      }
    },
    [id, onChanged],
  );

  useEffect(() => {
    setDetail(null);
    setDeep(false);
    setTexto("");
    setCitando(null);
    setLoading(true);
  }, [id]);

  useEffect(() => {
    void carregar(deep, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, deep]);

  // Só atualiza com a aba à vista: manter o laço rodando numa aba escondida
  // gastaria leitura no OpenWA sem ninguém olhando.
  useEffect(() => {
    const tique = () => {
      if (document.visibilityState === "visible") void carregar(deep, true);
    };
    const relogio = window.setInterval(tique, RITMO);
    document.addEventListener("visibilitychange", tique);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", tique);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, deep]);

  const quantas = detail?.messages.length ?? 0;
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [id, quantas]);

  async function enviar(event: React.FormEvent) {
    event.preventDefault();
    const mensagem = texto.trim();
    if (!mensagem || enviando) return;
    setEnviando(true);
    try {
      const citada = citando;
      const { waMessageId } = await replyToConversation(id, mensagem, citada?.waMessageId);
      setTexto("");
      setCitando(null);
      // Acrescenta a mensagem que o servidor ACABOU de gravar. Não é otimismo:
      // só chega aqui depois do 201. Balão que aparece antes da confirmação e
      // some depois é a mesma família do vazio que mente.
      setDetail((atual) =>
        atual
          ? {
              ...atual,
              messages: [
                ...atual.messages,
                {
                  id: waMessageId,
                  waMessageId,
                  fromMe: true,
                  author: null,
                  authorName: null,
                  type: "text",
                  body: mensagem,
                  sentAt: new Date().toISOString(),
                  preview: mensagem,
                  hasMedia: false,
                  media: null,
                  quoted: citada ? { waMessageId: citada.waMessageId, preview: citada.preview } : null,
                } satisfies Message,
              ],
            }
          : atual,
      );
      onChanged();
    } catch (error) {
      // O servidor manda a frase em pt-BR, inclusive a do teto de 30 por
      // minuto. Repetir aqui seria manter duas versões da mesma regra.
      toast.error(error instanceof AuthError ? error.message : "Não foi possível enviar a mensagem.");
    } finally {
      setEnviando(false);
    }
  }

  async function enviarArquivo(escolhido: File) {
    if (escolhido.size > LIMITE_ARQUIVO) {
      // Recusa ANTES de subir: mandar 40 MB para receber 413 gasta o tempo da
      // pessoa e a banda dela para chegar na mesma resposta.
      toast.error(`O arquivo tem ${(escolhido.size / 1024 / 1024).toFixed(1)} MB e o limite é 16 MB.`);
      return;
    }
    const legenda = texto.trim();
    if (legenda.length > LIMITE_LEGENDA) {
      toast.error(`A legenda passa de ${LIMITE_LEGENDA} caracteres, que é o limite.`);
      return;
    }
    setEnviando(true);
    try {
      await sendMedia(id, escolhido, {
        caption: legenda || undefined,
        quotedWaMessageId: citando?.waMessageId,
      });
      setTexto("");
      setCitando(null);
      // Sem balão otimista aqui: o tipo e a prévia quem calcula é o servidor, e
      // adivinhá-los seria a tela afirmando o que ainda não leu. A releitura
      // traz a mensagem já montada.
      await carregar(deep, true);
      onChanged();
    } catch (error) {
      toast.error(error instanceof AuthError ? error.message : "Não foi possível enviar o arquivo.");
    } finally {
      setEnviando(false);
    }
  }

  if (loading && !detail) {
    return (
      <div className="wa-thread">
        <div className="wa-thread-body"><ActivitySkeleton count={5} /></div>
      </div>
    );
  }

  if (failed !== null && !detail) {
    return (
      <div className="wa-thread">
        <div className="wa-thread-body"><LoadFailure onRetry={() => void carregar(deep, false)} status={failed} /></div>
      </div>
    );
  }

  if (!detail) return null;

  const grupo = detail.kind === "group";
  const telefone = formatarTelefone(detail.phone);
  const excedeu = texto.length > LIMITE_MENSAGEM;
  const impedimento = !canWrite
    ? "Responder mensagens não faz parte do seu acesso."
    : readOnly
      ? READ_ONLY_REASON
      : null;

  return (
    <div className="wa-thread">
      <header className="wa-thread-header">
        <button aria-label="Voltar para a lista" className="wa-back" onClick={onBack} type="button">
          <ArrowLeft aria-hidden />
        </button>
        <WaAvatar name={nomeDe(detail)} photoUrl={photoUrl} size={40} />
        <div className="wa-thread-who">
          <strong>{nomeDe(detail)}</strong>
          <small>
            {grupo && <><Users aria-hidden />Grupo</>}
            {!grupo && telefone}
            {telefone && foraDoCadastro(detail) && " · "}
            {foraDoCadastro(detail) && "Não está no cadastro"}
          </small>
        </div>
      </header>

      {detail.stale && (
        <p className="wa-thread-warning" role="status">
          <CloudOff aria-hidden />
          <span>
            O WhatsApp não respondeu agora. Estas são as mensagens que já tínhamos — pode haver mais recentes que ainda
            não chegaram aqui.
          </span>
        </p>
      )}

      <div className="wa-thread-body">
        {/* O topo da conversa não pode PARECER o começo dela quando não é. */}
        {detail.hasMore && !detail.deep && (
          <button className="wa-load-more" onClick={() => setDeep(true)} type="button">
            Trazer mensagens mais antigas
          </button>
        )}
        {detail.hasMore && detail.deep && (
          <p className="wa-thread-cap">
            Estas são as {FUNDO} mensagens mais recentes. A conversa é maior que isso, e o WhatsApp não entrega mais que
            isso de uma vez.
          </p>
        )}
        {!detail.hasMore && detail.messages.length >= RASO && (
          <p className="wa-thread-cap">Começo do que foi trazido.</p>
        )}

        {!detail.messages.length && (
          <p className="wa-empty">Nenhuma mensagem nesta conversa ainda.</p>
        )}

        <ol className="wa-messages">
          {detail.messages.map((mensagem, indice) => {
            const anterior = detail.messages[indice - 1];
            const virouODia = diaDe(mensagem.sentAt) !== (anterior ? diaDe(anterior.sentAt) : "");
            return (
              <li key={mensagem.id}>
                {virouODia && <p className="wa-day">{rotuloDoDia(mensagem.sentAt)}</p>}
                <div className={`wa-bubble${mensagem.fromMe ? " is-mine" : ""}`}>
                  {grupo && !mensagem.fromMe && (mensagem.authorName || mensagem.author) && (
                    <span className="wa-bubble-author">{mensagem.authorName ?? autorDe(mensagem.author!)}</span>
                  )}

                  {/* A citada. O `preview` já vem pronto do servidor, inclusive
                      o "[mensagem fora do trecho carregado]" de quando ela está
                      acima do que foi trazido -- some melhor que um vazio. */}
                  {mensagem.quoted && (
                    <p className="wa-bubble-citada">{mensagem.quoted.preview}</p>
                  )}

                  {mensagem.hasMedia ? (
                    <MessageMedia mensagem={mensagem} />
                  ) : (
                    /* Texto mostra o corpo inteiro; o resto mostra o marcador
                       que o servidor calculou. A tela não tem tabela de tipos. */
                    <p>{mensagem.type === "text" ? (mensagem.body ?? mensagem.preview) : mensagem.preview}</p>
                  )}

                  <time dateTime={mensagem.sentAt}>{hora(mensagem.sentAt)}</time>

                  {/* Citar e encaminhar são ESCRITA: sem a permissão, nem
                      aparecem. No dedo ficam sempre visíveis, porque passar o
                      mouse não existe -- ver a camada de toque no globals.css. */}
                  {canWrite && !readOnly && (
                    <span className="wa-bubble-acoes">
                      <button onClick={() => { setCitando(mensagem); campo.current?.focus(); }} type="button">
                        <CornerUpLeft aria-hidden />Responder
                      </button>
                      <button onClick={() => setEncaminhando(mensagem)} type="button">
                        <Forward aria-hidden />Encaminhar
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <div ref={fim} />
      </div>

      {impedimento ? (
        <p className="wa-thread-blocked">{impedimento}</p>
      ) : (
        <form className="wa-composer" onSubmit={enviar}>
          {/* O que vai ser citado, à vista antes de mandar. Sem esta barra a
              citação some da tela e a pessoa não sabe que está citando. */}
          {citando && (
            <p className="wa-composer-citada">
              <span>{citando.preview}</span>
              <button aria-label="Não citar" onClick={() => setCitando(null)} type="button"><X aria-hidden /></button>
            </p>
          )}
          {/* O tipo sai do mimetype NO SERVIDOR, então a tela não pergunta se é
              foto ou documento -- perguntar seria inventar uma decisão que não
              é dela. Só o teto é conferido aqui, para não subir 16 MiB à toa. */}
          <input
            className="wa-arquivo"
            onChange={(evento) => { const f = evento.target.files?.[0]; evento.target.value = ""; if (f) void enviarArquivo(f); }}
            ref={arquivo}
            type="file"
          />
          <button
            aria-label="Enviar arquivo"
            className="wa-anexar"
            disabled={enviando}
            onClick={() => arquivo.current?.click()}
            type="button"
          >
            <Paperclip aria-hidden />
          </button>
          <textarea
            ref={campo}
            onChange={(event) => setTexto(event.target.value)}
            onKeyDown={(event) => {
              // Enter envia, Shift+Enter quebra a linha: é o que a mão já sabe
              // fazer no WhatsApp.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void enviar(event);
              }
            }}
            placeholder="Escreva uma mensagem"
            rows={1}
            value={texto}
          />
          <button aria-label="Enviar" className="primary-action" disabled={!texto.trim() || excedeu || enviando} type="submit">
            <Send aria-hidden />
          </button>
          {/* O contador só aparece quando chega perto: um número sempre visível
              vira ruído em mensagem de duas linhas. */}
          {texto.length > LIMITE_MENSAGEM - 300 && (
            <small className={excedeu ? "is-over" : undefined}>
              {texto.length} de {LIMITE_MENSAGEM}
            </small>
          )}
        </form>
      )}

      {encaminhando && (
        <ForwardDialog
          mensagem={encaminhando}
          onClose={() => setEncaminhando(null)}
          onEncaminhada={onChanged}
          origemId={id}
        />
      )}
    </div>
  );
}

/** `5511988881111@c.us` → telefone legível. Grupo manda o JID de quem falou. */
function autorDe(author: string) {
  const numero = author.split("@")[0];
  return formatarTelefone(/^\d{10,15}$/.test(numero) ? numero : null) ?? numero;
}

const diaDe = (iso: string) => new Date(iso).toDateString();
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function rotuloDoDia(iso: string) {
  const data = new Date(iso);
  const hoje = new Date();
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (dia(data) === dia(hoje)) return "Hoje";
  if (dia(hoje) - dia(data) === 86_400_000) return "Ontem";
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}
