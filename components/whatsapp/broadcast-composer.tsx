"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, LoaderCircle, Search, Send, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { AuthError } from "@/components/auth/session";
import {
  MOTIVO_TEXTO,
  createBroadcast,
  formatDuration,
  listBroadcastRecipients,
  type BroadcastAudience,
  type BroadcastFilters,
  type BroadcastPreview,
  type BroadcastTarget,
} from "@/components/whatsapp/api";

const MENSAGEM_MAX = 4096;
/** O máximo que a rota aceita por página. Menos páginas, menos idas. */
const POR_PAGINA = 100;

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
  const [destinatarios, setDestinatarios] = useState<BroadcastTarget[]>([]);
  /** Quem a pessoa DESMARCOU. Guardar quem saiu, e não quem ficou, faz o
   *  padrão ser "todo mundo que pode receber", que é o que o filtro disse. */
  const [tirados, setTirados] = useState<Set<string>>(new Set());
  const [listaAberta, setListaAberta] = useState(false);

  useEffect(() => {
    fetch("/api/ministries", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => payload && setMinistries((payload.ministries ?? payload).map((item: { name: string }) => item.name)))
      .catch(() => undefined);
  }, []);

  /**
   * Uma fonte só para o resumo E para os nomes.
   *
   * A rota de destinatários devolve os dois na MESMA resolução, e é por isso
   * que ela substituiu a prévia: pedir o resumo de um lado e a lista de outro
   * seriam dois instantes diferentes, e eles podem discordar.
   *
   * Traz TODAS as páginas até o teto, porque é a lista inteira que vira o
   * `incluir` do envio -- mandar só a primeira página faria a tela conferir
   * duzentos e enviar para cinquenta.
   */
  const conferir = useCallback(async (proximoPublico: BroadcastAudience, proximosFiltros: BroadcastFilters) => {
    setPreviewing(true);
    try {
      const primeira = await listBroadcastRecipients({
        audience: proximoPublico, filters: proximosFiltros, page: 1, pageSize: POR_PAGINA,
      });
      setPreview(primeira.resumo);

      const teto = primeira.resumo.teto;
      const alvo = Math.min(primeira.total, teto);
      const juntos = [...primeira.records];
      for (let pagina = 2; juntos.length < alvo; pagina += 1) {
        const proxima = await listBroadcastRecipients({
          audience: proximoPublico, filters: proximosFiltros, page: pagina, pageSize: POR_PAGINA,
        });
        if (!proxima.records.length) break;
        juntos.push(...proxima.records);
      }
      setDestinatarios(juntos.slice(0, teto));
      // Filtro novo, seleção nova: quem foi desmarcado era de outra pergunta.
      setTirados(new Set());
    } catch {
      setPreview(null);
      setDestinatarios([]);
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
      // `incluir` vai SEMPRE, mesmo sem ninguém desmarcado: é o que faz o que
      // foi conferido na tela e o que sai serem a mesma lista, e não duas
      // resoluções em momentos diferentes.
      const criado = await createBroadcast({
        audience, message: message.trim(), filters, incluir: escolhidos.map((d) => d.personId),
      });
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

  const podemReceber = destinatarios.filter((d) => d.recebe);
  const escolhidos = podemReceber.filter((d) => !tirados.has(d.personId));
  const foraDoEnvio = destinatarios.filter((d) => !d.recebe);
  const semDestinatario = preview !== null && escolhidos.length === 0;
  const podeConfirmar = conectado && !semDestinatario && message.trim().length > 0 && message.length <= MENSAGEM_MAX;
  const acimaDe100 = escolhidos.length > 100;

  /**
   * A duração de QUEM FOI ESCOLHIDO.
   *
   * O intervalo entre mensagens é do servidor e a tela não o conhece -- mas ela
   * conhece dois números dele: quanto tempo leva para `comTelefone` pessoas.
   * Dividir um pelo outro dá a taxa do servidor, e multiplicar pela seleção é
   * usar essa taxa, não inventar uma. Sem isto, desmarcar metade da lista
   * continuaria anunciando a duração da lista inteira.
   */
  const segundosDoEnvio = preview && preview.comTelefone > 0
    ? Math.round((preview.estimativaSegundos / preview.comTelefone) * escolhidos.length)
    : 0;

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
              {/* Quando há seleção manual, o número da duração NÃO é o dos que
                  têm telefone -- dizer "24 têm telefone. O envio leva X" com X
                  calculado sobre 12 gruda um tempo no número errado. */}
              {escolhidos.length !== preview.comTelefone && (
                <> Você selecionou <strong>{escolhidos.length}</strong>.</>
              )}
              {escolhidos.length > 0 && <> O envio leva <strong>{formatDuration(segundosDoEnvio)}</strong>.</>}
            </span>
          ) : (
            <span>Não foi possível conferir quem entra agora.</span>
          )}
        </div>

        {destinatarios.length > 0 && (
          <div className="wa-alvos">
            <button
              aria-expanded={listaAberta}
              className="wa-alvos-abrir"
              onClick={() => setListaAberta((valor) => !valor)}
              type="button"
            >
              {listaAberta ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
              Ver e escolher quem recebe
              <small>{escolhidos.length} de {podemReceber.length} selecionados</small>
            </button>

            {listaAberta && (
              <>
                {escolhidos.length !== podemReceber.length && (
                  <button className="wa-alvos-todos" onClick={() => setTirados(new Set())} type="button">
                    Marcar todos de novo
                  </button>
                )}
                <ul className="wa-alvos-lista">
                  {destinatarios.map((pessoa) => (
                    <li key={pessoa.personId}>
                      <label className={pessoa.recebe ? undefined : "is-fora"}>
                        <input
                          checked={pessoa.recebe && !tirados.has(pessoa.personId)}
                          /* Quem não pode receber não é uma escolha: desmarcar
                             ou marcar não mudaria nada, e uma caixa que não faz
                             nada é a promessa vazia de sempre. */
                          disabled={!pessoa.recebe}
                          onChange={() => setTirados((atuais) => {
                            const proximos = new Set(atuais);
                            if (proximos.has(pessoa.personId)) proximos.delete(pessoa.personId);
                            else proximos.add(pessoa.personId);
                            return proximos;
                          })}
                          type="checkbox"
                        />
                        <strong>{pessoa.name}</strong>
                        {/* Telefone OU motivo, nunca os dois com um traço no
                            meio: quem tem telefone mostra o número; quem não tem
                            mostra só o porquê. O "—" antes do motivo era ruído
                            sobre uma informação que o próprio motivo já dá.
                            Quem fica de fora continua APARECENDO, com o porquê --
                            sumir com a linha esconderia o que precisa de conserto
                            na ficha da pessoa. */}
                        {pessoa.phone && <small className="wa-alvos-fone">{pessoa.phone}</small>}
                        {pessoa.motivo && <small className="wa-alvos-motivo">{MOTIVO_TEXTO[pessoa.motivo]}</small>}
                      </label>
                    </li>
                  ))}
                </ul>
                {foraDoEnvio.length > 0 && (
                  <p className="wa-alvos-nota">
                    {foraDoEnvio.length === 1 ? "1 pessoa aparece na lista e não recebe" : `${foraDoEnvio.length} pessoas aparecem na lista e não recebem`}
                    , com o motivo ao lado do nome. Corrigir a ficha resolve para os próximos envios.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {preview?.acimaDoTeto && (
          <p className="wa-note"><TriangleAlert aria-hidden /><span>O limite é de {preview.teto} pessoas por envio. Este vai para as {preview.teto} primeiras; para alcançar o resto, filtre e faça um segundo envio.</span></p>
        )}

        {/* Dois motivos diferentes para não haver destinatário, e a frase de um
            não serve para o outro: "ninguém tem telefone" para quem acabou de
            desmarcar todo mundo mandaria a pessoa procurar defeito na ficha. */}
        {semDestinatario && podemReceber.length === 0 && (
          <p className="wa-note"><TriangleAlert aria-hidden /><span>Ninguém nesse filtro tem telefone cadastrado, então não há para quem enviar. O telefone entra na ficha da pessoa.</span></p>
        )}
        {semDestinatario && podemReceber.length > 0 && (
          <p className="wa-note"><TriangleAlert aria-hidden /><span>Todos foram desmarcados, então não há para quem enviar. Marque ao menos uma pessoa na lista acima.</span></p>
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
              Enviar para <strong>{escolhidos.length}</strong> {escolhidos.length === 1 ? "pessoa" : "pessoas"},{" "}
              {formatDuration(segundosDoEnvio)}.
            </p>
            {escolhidos.length !== podemReceber.length && (
              <p className="wa-confirm-note">
                {podemReceber.length - escolhidos.length === 1
                  ? "1 pessoa que podia receber foi desmarcada e não entra neste envio."
                  : `${podemReceber.length - escolhidos.length} pessoas que podiam receber foram desmarcadas e não entram neste envio.`}
              </p>
            )}
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
