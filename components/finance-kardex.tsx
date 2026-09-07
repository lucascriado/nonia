"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/components/current-user";

/**
 * Kardex imprimível: o extrato do período com saldo corrente, para o tesoureiro
 * conferir e imprimir. O contrato é do #3:
 *
 *   GET /api/financeiro/kardex?de=YYYY-MM-DD&ate=YYYY-MM-DD   (finance.read)
 *   -> { de, ate, saldoAnterior, linhas[], totais, pendente }
 *   Sem de/ate: mês corrente NO FUSO DA IGREJA.
 *
 * Três coisas que a tela NÃO pode fazer, porque destroem a razão do relatório:
 * - NÃO reordenar as linhas. A ordem é crescente e determinística
 *   (transaction_date, created_at, id); o saldo corrente só existe nessa ordem,
 *   e reordenar faria cada saldo mentir. Renderizamos na ordem que veio.
 * - NÃO esconder o SALDO ANTERIOR. Sem ele o período começa em zero e toda
 *   linha mente.
 * - O PENDENTE fica no rodapé, à parte, nunca somado ao saldo.
 *
 * Se o período for grande demais a API RECUSA com uma frase que diz o que fazer;
 * mostramos a frase, não um erro genérico -- kardex com linha faltando fica
 * coerente entre as que sobram e parece certo estando errado.
 */

type KardexLinha = {
  id: string;
  date: string;
  description: string;
  category?: string | null;
  entrada: number;
  saida: number;
  saldo: number;
};

type KardexPendente = { entradas: number; saidas: number; quantidade: number } | null;

type Kardex = {
  de: string;
  ate: string;
  saldoAnterior: number;
  linhas: KardexLinha[];
  totais: { entradas: number; saidas: number; saldo: number };
  pendente: KardexPendente;
};

const num = (valor: unknown) => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

export function FinanceKardex({ onClose }: { onClose: () => void }) {
  const { organization } = useSession();
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [dados, setDados] = useState<Kardex | null>(null);
  const [carregando, setCarregando] = useState(true);
  /** A frase de recusa da API (período grande demais). Não é erro genérico. */
  const [recusa, setRecusa] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  const carregar = useCallback(async (deArg: string, ateArg: string) => {
    setCarregando(true);
    setRecusa(null);
    setFalhou(false);
    try {
      const busca = new URLSearchParams();
      // Sem de/ate a API assume o mês corrente NO FUSO DA IGREJA -- não montamos
      // o mês no fuso do navegador, que pode diferir.
      if (deArg && ateArg) {
        busca.set("de", deArg);
        busca.set("ate", ateArg);
      }
      const sufixo = busca.toString() ? `?${busca.toString()}` : "";
      const resposta = await fetch(`/api/financeiro/kardex${sufixo}`, { cache: "no-store" });
      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => null)) as { error?: string } | null;
        if (corpo?.error) {
          setRecusa(corpo.error);
          setDados(null);
        } else {
          setFalhou(true);
        }
        return;
      }
      const kardex = (await resposta.json()) as Kardex;
      setDados(kardex);
      // Reflete o período que a API decidiu (o mês da igreja) nos campos, para o
      // usuário ver de onde partir.
      setDe(kardex.de?.slice(0, 10) ?? "");
      setAte(kardex.ate?.slice(0, 10) ?? "");
    } catch {
      setFalhou(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar("", "");
  }, [carregar]);

  function atualizar() {
    if (de && ate && de > ate) {
      toast.error("A data inicial é depois da final.");
      return;
    }
    void carregar(de, ate);
  }

  const temPendente = dados?.pendente && dados.pendente.quantidade > 0;

  return (
    <div className="kardex-layer" role="dialog" aria-modal="true" aria-label="Kardex financeiro">
      {/* A barra de controle NÃO é impressa: some no @media print. */}
      <div className="kardex-toolbar">
        <div className="kardex-toolbar-title">
          <strong>Kardex</strong>
          <span>Extrato com saldo corrente, para conferir e imprimir.</span>
        </div>
        <label><span>De</span><input type="date" value={de} onChange={(evento) => setDe(evento.target.value)} /></label>
        <label><span>Até</span><input type="date" value={ate} onChange={(evento) => setAte(evento.target.value)} /></label>
        <button type="button" onClick={atualizar} disabled={carregando}>Atualizar</button>
        <button type="button" className="primary-action" onClick={() => window.print()} disabled={carregando || !dados}>
          <Printer aria-hidden />Imprimir
        </button>
        <button type="button" className="kardex-fechar" onClick={onClose} aria-label="Fechar"><X /></button>
      </div>

      <div className="kardex-report">
        {carregando ? (
          <p className="kardex-aviso"><LoaderCircle className="button-spinner" aria-hidden />Montando o kardex…</p>
        ) : recusa ? (
          // A frase da API, tal como veio: ela diz o que fazer (estreitar o período).
          <p className="kardex-recusa" role="status">{recusa}</p>
        ) : falhou ? (
          <p className="kardex-aviso">Não foi possível carregar o kardex. <button type="button" className="text-button" onClick={atualizar}>Tentar de novo</button></p>
        ) : dados ? (
          <>
            <header className="kardex-cabecalho">
              <div>
                <h2>Kardex financeiro</h2>
                {organization?.name && <p className="kardex-org">{organization.name}</p>}
              </div>
              <p className="kardex-periodo">Período: {formatDate(dados.de)} a {formatDate(dados.ate)}</p>
            </header>

            {/* Saldo anterior SEMPRE visível: é o ponto de partida do saldo corrente. */}
            <div className="kardex-saldo-anterior">
              <span>Saldo anterior</span>
              <strong>{formatCurrency(num(dados.saldoAnterior))}</strong>
            </div>

            <div className="kardex-tabela-wrap">
              <table className="kardex-tabela">
                <thead>
                  <tr>
                    <th className="kardex-col-data">Data</th>
                    <th>Descrição</th>
                    <th className="kardex-col-cat">Categoria</th>
                    <th className="kardex-num">Entrada</th>
                    <th className="kardex-num">Saída</th>
                    <th className="kardex-num">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.linhas.length === 0 ? (
                    <tr><td colSpan={6} className="kardex-vazio">Nenhum lançamento efetivado neste período.</td></tr>
                  ) : (
                    // Ordem preservada: renderizamos como veio, sem sort.
                    dados.linhas.map((linha) => (
                      <tr key={linha.id}>
                        <td className="kardex-col-data">{formatDate(linha.date)}</td>
                        <td>{linha.description}</td>
                        <td className="kardex-col-cat">{linha.category || "—"}</td>
                        <td className="kardex-num">{num(linha.entrada) ? formatCurrency(num(linha.entrada)) : ""}</td>
                        <td className="kardex-num">{num(linha.saida) ? formatCurrency(num(linha.saida)) : ""}</td>
                        <td className="kardex-num kardex-saldo">{formatCurrency(num(linha.saldo))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="kardex-totais">
                    <td colSpan={3}>Totais do período</td>
                    <td className="kardex-num">{formatCurrency(num(dados.totais.entradas))}</td>
                    <td className="kardex-num">{formatCurrency(num(dados.totais.saidas))}</td>
                    <td className="kardex-num kardex-saldo">{formatCurrency(num(dados.totais.saldo))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* PENDENTE à parte, no rodapé, e nunca somado ao saldo acima. */}
            {temPendente && dados.pendente && (
              <div className="kardex-pendente">
                <strong>A confirmar (pendente)</strong>
                <p>
                  {dados.pendente.quantidade === 1
                    ? "1 lançamento ainda não efetivado"
                    : `${dados.pendente.quantidade} lançamentos ainda não efetivados`}
                  , fora do saldo: entradas {formatCurrency(num(dados.pendente.entradas))}, saídas {formatCurrency(num(dados.pendente.saidas))}.
                </p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
