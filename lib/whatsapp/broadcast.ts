import { Op } from "sequelize";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { filtrosDeMembros, filtrosDeVisitantes } from "@/lib/listings";
import { MemberDirectory, VisitorDirectory, WhatsappBroadcast, WhatsappBroadcastRecipient } from "@/lib/models";
import * as openwa from "./openwa";
import { Conexao } from "./connection";

/**
 * Envio em massa.
 *
 * TETO DE 500 PESSOAS POR ENVIO, expresso em PESSOAS e não em bytes nem em
 * tempo -- mesmo critério do teto de 500 comprovantes: limite que se entende
 * ganha de promessa que às vezes quebra.
 *
 * E o teto tem uma consequência que a tela PRECISA dizer antes de confirmar:
 * com ~4 s por mensagem, 500 pessoas são mais de meia hora. Por isso
 * `estimativa()` existe e o preview a devolve. "500 pessoas" sozinho é
 * armadilha; "500 pessoas, cerca de 35 minutos" é informação.
 */
export const TETO_POR_ENVIO = 500;

/** Duração estimada, em segundos. O jitter médio entra porque ele é metade do intervalo. */
export const estimativaSegundos = (destinatarios: number) =>
  Math.round((destinatarios * (openwa.INTERVALO_MS + openwa.JITTER_MEDIO_MS)) / 1000);

/**
 * Telefone do cadastro -> chatId do WhatsApp.
 *
 * Devolve `null` em vez de lançar: número faltando ou impossível é CASO NORMAL,
 * não erro. Metade de um cadastro de igreja pode não ter telefone, e isso vira
 * "não recebe" na conferência de antes do envio, nunca uma falha depois.
 */
export function chatIdDoTelefone(telefone: string | null | undefined): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  // 10 (fixo com DDD) ou 11 (celular com DDD) -> falta o país, e aqui é 55.
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}@c.us`;
  // Já com país: 12 ou 13 dígitos começando em 55.
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return `${digitos}@c.us`;
  // Estrangeiro plausível. Não inventamos país para número que não reconhecemos.
  if (digitos.length >= 11 && digitos.length <= 15) return `${digitos}@c.us`;
  return null;
}

export type Publico = "members" | "visitors";

/**
 * POR QUE ALGUÉM NÃO RECEBE. Nunca "some da lista": o nome fica visível com o
 * motivo ao lado.
 *
 *   sem_telefone      não há telefone no cadastro
 *   telefone_invalido há telefone, mas ele não vira um número de WhatsApp
 *   numero_repetido   outra pessoa da MESMA lista tem este número, e ela recebe
 *
 * Nome que desaparece sem explicação é a família de defeito que este projeto
 * vem recusando o dia inteiro -- é o vazio que mente, com outra roupa. Quem
 * olha a lista precisa poder conferir "faltou a Maria?" e achar a Maria ali,
 * dizendo por que não recebe.
 */
export type MotivoDeNaoReceber = "sem_telefone" | "telefone_invalido" | "numero_repetido";

export type Candidato = {
  id: string;
  name: string;
  phone: string | null;
  chatId: string | null;
  recebe: boolean;
  motivo: MotivoDeNaoReceber | null;
};

/**
 * Quem seria alcançado pelo filtro que a pessoa está vendo.
 *
 * Sai do MESMO `lib/listings.ts` da listagem e da exportação. Não é economia de
 * código: é o que faz "mandar para quem estou vendo" ser estrutural em vez de
 * depender de alguém manter dois WHERE espelhados.
 *
 * É TAMBÉM A ÚNICA RESOLUÇÃO DE PÚBLICO DO PROJETO: a prévia com nomes, a
 * conferência de números e a criação do envio chamam esta função e mais
 * nenhuma. Prévia e envio calculados por caminhos diferentes seria uma prévia
 * que vira mentira no dia em que um dos dois mudar -- e ninguém descobriria,
 * porque os dois continuariam "funcionando".
 */
export async function candidatos(
  publico: Publico,
  params: URLSearchParams,
  organizationId: string,
  // O fuso da igreja atravessa até aqui porque a aba "Recentes" dos visitantes
  // é um filtro de DATA, e esta função é a única resolução de público do
  // projeto: se o fuso parasse no meio do caminho, a prévia e o envio
  // continuariam concordando entre si e os dois estariam errados juntos --
  // que é o pior modo de falhar deste arquivo.
  fuso: string | null | undefined,
): Promise<Candidato[]> {
  const filtro = publico === "members"
    ? filtrosDeMembros(params, organizationId)
    : filtrosDeVisitantes(params, organizationId, fuso);
  const opcoes = {
    attributes: ["id", ["full_name", "name"], "phone"] as (string | [string, string])[],
    where: filtro,
    order: [["fullName", "ASC"]] as [string, string][],
    limit: TETO_POR_ENVIO + 1,
    raw: true,
  };
  const rows = (publico === "members"
    ? await MemberDirectory.findAll(opcoes)
    : await VisitorDirectory.findAll(opcoes)) as unknown as { id: string; name: string; phone: string | null }[];
  return marcar(rows);
}

/**
 * DUAS PESSOAS COM O MESMO NÚMERO RECEBEM UMA MENSAGEM SÓ.
 *
 * Casal que divide telefone é comum em igreja, e sem esta deduplicação o mesmo
 * aparelho recebia a mesma mensagem duas vezes, com 3 s entre elas. Para quem
 * recebe é desleixo; para o WhatsApp é padrão de robô -- exatamente o que o
 * intervalo entre mensagens existe para evitar. O disparo produzia sozinho a
 * assinatura que o resto do código passa o tempo todo protegendo.
 *
 * Quem recebe é o PRIMEIRO em ordem alfabética, que é a ordem que a tela mostra
 * -- assim a escolha é visível e estável, e não "o que o banco devolveu
 * primeiro". O segundo continua na lista, com `numero_repetido`.
 *
 * Aqui dentro, e não na rota, porque prévia e envio têm que enxergar o mesmo
 * público. Deduplicar só na exibição faria a tela mostrar 40 e o envio mandar
 * 41 -- que é o defeito que esta entrega inteira existe para fechar.
 */
function marcar(rows: { id: string; name: string; phone: string | null }[]): Candidato[] {
  const jaVisto = new Set<string>();
  return rows.map((r) => {
    const chatId = chatIdDoTelefone(r.phone);
    let motivo: MotivoDeNaoReceber | null = null;
    if (!chatId) motivo = (r.phone ?? "").trim() ? "telefone_invalido" : "sem_telefone";
    else if (jaVisto.has(chatId)) motivo = "numero_repetido";
    else jaVisto.add(chatId);
    return { ...r, chatId, recebe: motivo === null, motivo };
  });
}

/**
 * O MESMO público, resolvido a partir de uma lista explícita de pessoas.
 *
 * Mesma view, mesmo `chatIdDoTelefone`, mesma deduplicação, mesma ordem
 * alfabética -- de propósito: se esta função e `candidatos()` divergissem em
 * qualquer detalhe, a lista que a pessoa conferiu e a lista que sai teriam
 * regras diferentes, que é o problema com um nome novo.
 *
 * O id que não for desta igreja simplesmente não volta da consulta -- o `WHERE
 * organization_id` faz a checagem de tenant ser estrutural, e não uma validação
 * que alguém pode esquecer de chamar.
 */
export async function porIds(publico: Publico, ids: string[], organizationId: string): Promise<Candidato[]> {
  if (!ids.length) return [];
  // As mesmas colunas, ordem e teto de `candidatos()`; só o `where` muda.
  const opcoes = {
    attributes: ["id", ["full_name", "name"], "phone"] as (string | [string, string])[],
    where: { organizationId, id: ids },
    order: [["fullName", "ASC"]] as [string, string][],
    limit: TETO_POR_ENVIO + 1,
    raw: true,
  };
  const rows = (publico === "members"
    ? await MemberDirectory.findAll(opcoes)
    : await VisitorDirectory.findAll(opcoes)) as unknown as { id: string; name: string; phone: string | null }[];
  return marcar(rows);
}

export type Conferencia = {
  total: number;
  comTelefone: number;
  semTelefone: number;
  acimaDoTeto: boolean;
  teto: number;
  estimativaSegundos: number;
};

/**
 * A conferência de ANTES. Ausência informada antes vale mais que falha depois.
 *
 * `comTelefone` passa a ser QUEM RECEBE, e não quem tem número: com a
 * deduplicação, um casal que divide telefone são duas pessoas e uma mensagem.
 * Contar dois aqui faria a estimativa de duração mentir e faria a tela prometer
 * uma entrega que não acontece.
 */
export function conferir(lista: Candidato[]): Conferencia {
  const dentro = lista.slice(0, TETO_POR_ENVIO);
  const recebem = dentro.filter((c) => c.recebe).length;
  return {
    total: dentro.length,
    comTelefone: recebem,
    semTelefone: dentro.length - recebem,
    acimaDoTeto: lista.length > TETO_POR_ENVIO,
    teto: TETO_POR_ENVIO,
    estimativaSegundos: estimativaSegundos(recebem),
  };
}

// --- execução ---------------------------------------------------------------

/**
 * Empurra o envio um lote adiante, e é chamada NA LEITURA.
 *
 * O nonia não tem tarefa agendada -- decisão registrada, e o mesmo motivo de
 * plano efetivo e nível de acesso serem derivados na leitura. Então quem avança
 * o envio é quem olha para ele: a tela de acompanhamento consulta, e a consulta
 * fecha o lote terminado e começa o próximo.
 *
 * CONSEQUÊNCIA QUE PRECISA ESTAR DITA, e não escondida: um envio de 500 pessoas
 * são 5 lotes, e ele avança de lote quando alguém consulta. Com a tela aberta,
 * anda sozinho. Com a tela fechada, ele PAUSA na virada do lote e retoma quando
 * alguém abrir de novo -- não perde nada e não manda duas vezes, porque cada
 * destinatário tem status próprio e só sai de `pending` uma vez.
 */
export async function avancar(conexao: Conexao, broadcastId: string, organizationId: string) {
  const envio = await WhatsappBroadcast.findOne({
    attributes: ["id", "message", "status"],
    where: { id: broadcastId, organizationId },
    raw: true,
  });
  if (!envio) return;
  if (envio.status === "done" || envio.status === "canceled" || envio.status === "failed") return;

  // 1. Reconciliar o que já foi despachado: a ENTREGA é do OpenWA, e a linha
  //    daqui é cópia da resposta dele.
  const emVoo = await WhatsappBroadcastRecipient.findAll({
    attributes: ["waBatchId"],
    where: { broadcastId, status: "pending", waBatchId: { [Op.ne]: null } },
    group: ["wa_batch_id"],
    raw: true,
  });
  for (const { waBatchId } of emVoo) {
    await reconciliar(conexao, broadcastId, waBatchId as string);
  }

  // 2. Se não sobrou nada em voo, despachar o próximo lote.
  const pendentes = await WhatsappBroadcastRecipient.findAll({
    attributes: ["id", "phone"],
    where: { broadcastId, status: "pending", waBatchId: null },
    order: [["created_at", "ASC"], ["id", "ASC"]],
    limit: openwa.LOTE_MAX,
    raw: true,
  });

  const aindaEmVoo = await WhatsappBroadcastRecipient.count({
    where: { broadcastId, status: "pending", waBatchId: { [Op.ne]: null } },
  });

  if (aindaEmVoo === 0 && pendentes.length > 0) {
    // O despacho tem try próprio: o OpenWA fora do ar não pode impedir o
    // fechamento nem a leitura de refletirem o que já está gravado.
    try {
    const itens: openwa.ItemDoLote[] = [];
    const ids: string[] = [];
    const chats: string[] = [];
    for (const p of pendentes) {
      const chatId = chatIdDoTelefone(p.phone);
      if (!chatId) continue;
      itens.push({ chatId, type: "text", content: { text: envio.message } });
      ids.push(p.id);
      chats.push(chatId);
    }
    if (itens.length) {
      const lote = await openwa.enviarLote(conexao.sessionId, conexao.apiKey, itens);
      // Grava o chatId junto do lote: é por ele que a resposta volta a encontrar
      // esta linha, sem heurística.
      //
      // TUDO NUMA TRANSAÇÃO, e não é enfeite: é uma gravação por destinatário, e
      // um lote gravado pela metade deixaria linhas despachadas sem `wa_batch_id`
      // -- que a próxima leitura trataria como pendentes e mandaria DE NOVO.
      await db.transaction(async (transaction) => {
        for (let i = 0; i < ids.length; i++) {
          await WhatsappBroadcastRecipient.update(
            { waBatchId: lote.batchId, chatId: chats[i] },
            { where: { id: ids[i], broadcastId }, transaction },
          );
        }
        // `started_at` é o do PRIMEIRO lote: só é gravado se ainda está vazio.
        // As duas gravações têm condições que se excluem.
        const agora = new Date();
        await WhatsappBroadcast.update(
          { status: "running" },
          { where: { id: broadcastId, startedAt: { [Op.ne]: null } }, transaction },
        );
        await WhatsappBroadcast.update(
          { status: "running", startedAt: agora },
          { where: { id: broadcastId, startedAt: null }, transaction },
        );
      });
      }
    } catch (erro) {
      await fecharSeTerminou(broadcastId);
      throw erro;
    }
  }

  await fecharSeTerminou(broadcastId);
}

async function reconciliar(conexao: Conexao, broadcastId: string, batchId: string) {
  const lote = await openwa.lerLote(conexao.sessionId, conexao.apiKey, batchId).catch(() => null);
  if (!lote?.results?.length) return;

  for (const r of lote.results) {
    if (!r.chatId) continue;
    const entregue = Boolean(r.messageId) && !r.error;
    // `status: "pending"` no where é a TRAVA contra marcar duas vezes: linha que
    // já saiu de pendente não é tocada de novo.
    await WhatsappBroadcastRecipient.update(
      {
        status: entregue ? "sent" : "failed",
        waMessageId: r.messageId ?? null,
        errorCode: r.error?.code ?? null,
        errorMessage: (r.error?.message ?? null)?.slice(0, 300) ?? null,
        sentAt: r.sentAt != null ? new Date(r.sentAt) : (entregue ? new Date() : null),
      },
      { where: { broadcastId, waBatchId: batchId, chatId: r.chatId, status: "pending" } },
    );
  }
}

/**
 * Fecha o envio quando não sobrou ninguém pendente.
 *
 * Só isto: as CONTAGENS não são gravadas, são contadas na leitura por
 * `contagens()`. Gravá-las custou um defeito que o teste pegou -- com o
 * despacho falhando, o contador não rodava e a tela dizia "0 pulados" com três
 * pulados na tabela.
 */
async function fecharSeTerminou(broadcastId: string) {
  // Destinatário só SAI de pendente, nunca volta (e nenhum nasce depois que o
  // envio existe), então "nenhum pendente agora" continua verdade na gravação
  // logo abaixo.
  const pendentes = await WhatsappBroadcastRecipient.count({ where: { broadcastId, status: "pending" } });
  if (pendentes > 0) return;
  // Status final não é reaberto. E `finished_at` só é gravado se ainda está
  // vazio -- as duas gravações têm condições que se excluem.
  const aberto = { id: broadcastId, status: { [Op.notIn]: ["canceled", "done", "failed"] } };
  await WhatsappBroadcast.update(
    { status: "done" },
    { where: { ...aberto, finishedAt: { [Op.ne]: null } } },
  );
  await WhatsappBroadcast.update(
    { status: "done", finishedAt: new Date() },
    { where: { ...aberto, finishedAt: null } },
  );
}

export type Contagens = { sentCount: number; failedCount: number; skippedCount: number; pendingCount: number };

/** As contagens saem SEMPRE das linhas, nunca de coluna gravada antes. */
export async function contagens(broadcastId: string): Promise<Contagens> {
  const [sentCount, failedCount, skippedCount, pendingCount] = await Promise.all(
    (["sent", "failed", "skipped", "pending"] as const).map((status) =>
      WhatsappBroadcastRecipient.count({ where: { broadcastId, status } })),
  );
  return { sentCount, failedCount, skippedCount, pendingCount };
}

export function exigirMensagem(texto: unknown): string {
  const t = typeof texto === "string" ? texto.trim() : "";
  if (!t) throw badRequest("Escreva a mensagem antes de enviar.", "message_required");
  if (t.length > 4096) throw badRequest("A mensagem passa de 4096 caracteres, que é o limite do WhatsApp.", "message_too_long");
  return t;
}
