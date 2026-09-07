import { db, query } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { HttpError, badRequest } from "@/lib/http";
import * as openwa from "./openwa";
import { Conexao } from "./connection";

/**
 * A caixa de entrada.
 *
 * NENHUMA JANELA DE TEMPO INVENTADA, e é decisão: a lista de conversas vem
 * INTEIRA no pareamento (o WhatsApp empurra o retrato completo ao conectar, com
 * `syncFullHistory` desligado), e a ordenação que importa é por última
 * atividade -- que é como a pessoa procura uma conversa. Um corte tipo "90
 * dias" só criaria "por que a conversa da tia Maria sumiu?" para ganhar nada.
 *
 * Em "Recentes" eu cortei em 14 dias porque O DADO PEDIA: a semente tinha a
 * fronteira embutida e o rótulo prometia um período. Aqui não pede.
 */

/**
 * Prévia de uma mensagem, calculada NO SERVIDOR.
 *
 * Mensagem de mídia não pode virar linha vazia -- quem olha acha que quebrou.
 * Então vira marcador de TEXTO entre colchetes, sem ícone e sem cor.
 *
 * Os 16 tipos que o OpenWA serve estão todos aqui, e não só os três óbvios:
 * tipo não mapeado voltaria a ser a linha vazia que isto existe para evitar.
 * Dois merecem atenção: `voice` não é `audio` (é nota de voz), e `revoked` é
 * mensagem apagada pelo outro lado -- mostrar o marcador é mais honesto que
 * sumir com a linha, porque sumir faz a conversa parecer ter buracos.
 */
const MARCADOR: Record<string, string> = {
  image: "[foto]",
  video: "[vídeo]",
  audio: "[áudio]",
  voice: "[mensagem de voz]",
  document: "[documento]",
  sticker: "[figurinha]",
  location: "[localização]",
  contact: "[contato]",
  poll: "[enquete]",
  call: "[chamada]",
  revoked: "[mensagem apagada]",
  order: "[pedido]",
  product: "[produto]",
  masked: "[mensagem protegida]",
  unknown: "[mensagem não suportada]",
};

/**
 * QUAIS TIPOS CARREGAM ARQUIVO, e por que isto é uma função e não uma coluna.
 *
 * A 015 tinha `whatsapp_messages.has_media`, gravada na sincronização a partir
 * do campo `media` do OpenWA -- que só vem com `includeMedia=true`, que nós não
 * pedimos de propósito. Resultado: gravava FALSE para toda mensagem, inclusive
 * as que têm foto, e quem lesse depois acreditaria. Quarta marca do mesmo tipo
 * de `is_new` e `is_recent`, e essa foi minha.
 *
 * **TER MÍDIA NUNCA PODE SER DEDUZIDO DA PRESENÇA DOS BYTES**, e o número que
 * fecha o assunto veio da medida do container: o inline do OpenWA para de vir
 * acima de **1 MB** (`WEBHOOK_MEDIA_INLINE_MAX_BYTES`), e praticamente toda foto
 * de celular passa disso. Quem olhasse os bytes concluiria "mensagem sem mídia"
 * para quase toda foto real -- **em silêncio**, que é a mesma família do `qr`
 * que era `qrCode`: o código concorda com o defeito em vez de contradizê-lo.
 *
 * Ter mídia é propriedade do TIPO, e o tipo vem em toda mensagem, com bytes ou
 * sem. Derivar acerta também as linhas gravadas antes -- que é o que um DEFAULT
 * corrigido não daria.
 */
const TIPOS_COM_MIDIA: Record<string, "image" | "video" | "audio" | "voice" | "document" | "sticker"> = {
  image: "image",
  video: "video",
  audio: "audio",
  voice: "voice",
  ptt: "voice",
  document: "document",
  sticker: "sticker",
};

export function midiaDoTipo(tipo: string) {
  return TIPOS_COM_MIDIA[tipo] ?? null;
}

export function previa(tipo: string, corpo: string | null | undefined): string {
  const texto = (corpo ?? "").trim();
  if (tipo === "text") return texto.slice(0, 300);
  const marca = MARCADOR[tipo] ?? MARCADOR.unknown;
  // Foto COM legenda mostra as duas coisas: a legenda é conteúdo de verdade.
  return (texto ? `${marca} ${texto}` : marca).slice(0, 300);
}

/** Telefone a partir do chatId (`5511999999999@c.us`). Grupo e @lid não têm. */
export function telefoneDoChat(chatId: string): string | null {
  const [numero, dominio] = chatId.split("@");
  if (dominio !== "c.us" || !/^\d{10,15}$/.test(numero)) return null;
  return numero;
}

/**
 * O TELEFONE DE UM `@lid`, resolvido pelo OpenWA.
 *
 * Medido contra a conta real em 07/09/2026: TODAS as conversas dela chegam como
 * `@lid` (o id de privacidade que o WhatsApp adotou), nenhuma como `@c.us`.
 * Como `telefoneDoChat` só entende `@c.us`, sem isto nenhuma conversa tem
 * telefone, nenhuma casa com o cadastro, e a caixa inteira aparece como "não
 * identificado" -- a tela não mostraria o nome de ninguém.
 *
 * SOB DEMANDA, COM TETO E COM MEMÓRIA -- as três coisas, e a terceira é a que
 * quase faltou. Resolver um contato é uma requisição ao WhatsApp POR CONVERSA:
 *
 *  - **sob demanda**: só as que ainda não têm telefone, mais recentes primeiro,
 *    algumas por leitura. É o mesmo "quem avança é quem olha" do resto do
 *    projeto, que não tem tarefa agendada;
 *  - **com teto**: mil conversas não viram mil requisições numa abertura;
 *  - **com memória**: `phone_lookup_at` marca que já TENTAMOS. Sem essa marca,
 *    a conversa que o motor nunca vai mapear seria consultada de novo a cada
 *    abertura da caixa, para sempre -- o teto por passada esconderia o custo
 *    em vez de eliminá-lo, e ele cresceria com o número de conversas
 *    irresolvíveis. Tenta de novo depois de um dia, porque o próprio OpenWA
 *    chama isso de "best-effort": `phone: null` não afirma que a pessoa não tem
 *    número, só que ele ainda não aprendeu o mapa.
 *
 * Falha aqui não derruba nada: deixa a conversa sem telefone, que é exatamente
 * o estado em que ela já estava.
 */
export const REPETIR_BUSCA_APOS = "1 day";

export async function resolverTelefonesPendentes(conexao: Conexao, quantas = 25) {
  const { rows } = await query<{ id: string; chat_id: string }>(
    `SELECT id, chat_id FROM whatsapp_conversations
      WHERE organization_id = $1 AND phone IS NULL AND kind <> 'group'
        AND (phone_lookup_at IS NULL OR phone_lookup_at < now() - interval '${REPETIR_BUSCA_APOS}')
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT ${quantas}`,
    [conexao.organizationId],
  );
  let resolvidos = 0;
  for (const c of rows) {
    // A tentativa é marcada ANTES da chamada, e de propósito: se ela estourar,
    // a marca já está gravada e a conversa não volta na próxima leitura. Marcar
    // depois faria justamente o laço que esta coluna existe para impedir.
    await query(`UPDATE whatsapp_conversations SET phone_lookup_at = now() WHERE id = $1`, [c.id]);
    try {
      const { phone } = await openwa.resolverTelefone(conexao.sessionId, conexao.apiKey, c.chat_id);
      if (!phone) continue;
      const pessoa = await acharPessoa(conexao.organizationId, phone);
      await query(
        `UPDATE whatsapp_conversations
            SET phone = $2, person_id = COALESCE(person_id, $3), updated_at = now()
          WHERE id = $1`,
        [c.id, phone, pessoa],
      );
      resolvidos += 1;
    } catch {
      // Segue para a próxima: uma que o motor ainda não mapeou não pode impedir
      // as outras de serem resolvidas.
    }
  }
  return resolvidos;
}

/**
 * Casa a conversa com uma pessoa do cadastro pelos últimos 8 dígitos.
 *
 * Oito e não o número inteiro porque o cadastro tem "(11) 98888-1111" e o
 * WhatsApp tem "5511988881111": comparar formatos diferentes não casaria nunca.
 * O sufixo é o que sobrevive a DDI, DDD e ao nono dígito.
 *
 * Ambíguo (dois cadastros terminando igual) devolve NULL de propósito: ligar a
 * conversa à pessoa errada é pior que deixá-la como não identificada, porque o
 * erro fica invisível -- alguém responderia achando que fala com outra pessoa.
 */
async function acharPessoa(organizationId: string, telefone: string | null): Promise<string | null> {
  if (!telefone || telefone.length < 8) return null;
  const sufixo = telefone.slice(-8);
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM people
      WHERE organization_id = $1
        AND phone IS NOT NULL
        AND right(regexp_replace(phone, '\\D', '', 'g'), 8) = $2
      LIMIT 2`,
    [organizationId, sufixo],
  );
  return rows.length === 1 ? rows[0].id : null;
}

/**
 * GRUPO: DEFENDIDO NO CÓDIGO, NUNCA EXERCITADO CONTRA UM GRUPO DE VERDADE.
 *
 * Isto está escrito para não ser lido como "funciona". Em 07/09/2026 medi
 * contra a conta real pareada: `/chats` devolveu 5 conversas, **zero** com
 * `@g.us`, e `/groups` devolveu `[]`. Não havia o que medir, então não afirmo.
 *
 * O que o código faz por conta disso, e por quê:
 *
 *  - `kind` sai de `isGroup` do OpenWA, não de adivinhação sobre o sufixo do id;
 *  - em grupo, `from` é o GRUPO -- quem falou está em `author`, e o nome em
 *    `author_name`. Sem isso a conversa vira um monte de balão sem dono;
 *  - `resolverTelefonesPendentes` PULA grupo: grupo não tem telefone, e pedir a
 *    resolução de um seria uma chamada de rede garantidamente inútil por
 *    conversa;
 *  - vincular a pessoa do cadastro não se aplica a grupo, pelo mesmo motivo.
 *
 * Quando existir um grupo real na conta, medir de novo -- e o primeiro lugar a
 * olhar é se `author` vem preenchido, porque é dele que depende tudo aqui.
 */

/** Traz a LISTA de conversas. Uma requisição, e é ela que cumpre "carregou meus chats". */
export async function sincronizarConversas(conexao: Conexao) {
  const conversas = await openwa.listarConversas(conexao.sessionId, conexao.apiKey);
  for (const c of conversas) {
    const telefone = telefoneDoChat(c.id);
    const pessoa = await acharPessoa(conexao.organizationId, telefone);
    await query(
      `INSERT INTO whatsapp_conversations
         (organization_id, chat_id, kind, wa_name, phone, person_id,
          last_message_at, last_message_preview, unread_count)
       VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7), $8, $9)
       ON CONFLICT (organization_id, chat_id) DO UPDATE SET
         wa_name = EXCLUDED.wa_name,
         last_message_at = EXCLUDED.last_message_at,
         last_message_preview = EXCLUDED.last_message_preview,
         unread_count = EXCLUDED.unread_count,
         -- O vínculo com a pessoa NÃO é sobrescrito quando já existe: alguém
         -- pode tê-lo feito à mão, e uma sincronização não desfaz decisão de
         -- gente. Só preenche o que está vazio.
         person_id = COALESCE(whatsapp_conversations.person_id, EXCLUDED.person_id),
         kind = EXCLUDED.kind,
         phone = COALESCE(EXCLUDED.phone, whatsapp_conversations.phone),
         updated_at = now()`,
      [conexao.organizationId, c.id, c.isGroup ? "group" : (c.kind ?? "individual"),
       c.name ?? null, telefone, pessoa, c.timestamp || 0, (c.lastMessage ?? "").slice(0, 300) || null, c.unreadCount ?? 0],
    );
  }
  await query(
    `UPDATE organization_whatsapp SET chats_synced_at = now(), chats_known = $2, updated_at = now()
      WHERE organization_id = $1`,
    [conexao.organizationId, conversas.length],
  );
  return conversas.length;
}

/**
 * Traz o histórico de UMA conversa.
 *
 * CEM MENSAGENS, e é escolha de QUANTIDADE, não de tempo. Conversa de igreja
 * acontece em rajadas -- uma troca inteira de domingo passa fácil de 50 --, e
 * cortar no meio de uma conversa é pior que trazer um pouco a mais. 100 é
 * também o teto padrão da rota; acima disso ela exige `deep`, que vai até 2000
 * e traz aviso do próprio OpenWA sobre risco de limitação. Por isso o "trazer
 * mais" é sob demanda e não automático.
 *
 * Não há janela de TEMPO: nada some por idade.
 *
 * Reler não duplica: o par (organização, id da mensagem) é único no banco.
 */
export async function sincronizarMensagens(
  conexao: Conexao,
  conversaId: string,
  chatId: string,
  _cursor: string | null,
  limite = openwa.TETO_HISTORICO,
) {
  const mensagens = await openwa.lerHistorico(
    conexao.sessionId, conexao.apiKey, chatId, limite, limite > openwa.TETO_HISTORICO);
  let ultimo: string | null = null;
  for (const m of mensagens) {
    await query(
      `INSERT INTO whatsapp_messages
         (conversation_id, organization_id, wa_message_id, from_me, author, author_name,
          type, body, quoted_wa_message_id, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10))
       -- Reler o mesmo trecho não duplica: o par (igreja, id da mensagem) é único.
       -- Mas o que MUDA depois da primeira leitura precisa entrar: uma mensagem
       -- apagada volta com o tipo 'revoked', e manter o texto antigo seria
       -- mostrar o que o outro lado apagou.
       ON CONFLICT (organization_id, wa_message_id) DO UPDATE SET
         type = EXCLUDED.type,
         body = CASE WHEN EXCLUDED.type = 'revoked' THEN NULL ELSE COALESCE(EXCLUDED.body, whatsapp_messages.body) END,
         author_name = COALESCE(EXCLUDED.author_name, whatsapp_messages.author_name),
         quoted_wa_message_id = COALESCE(EXCLUDED.quoted_wa_message_id, whatsapp_messages.quoted_wa_message_id)`,
      [conversaId, conexao.organizationId, m.id, Boolean(m.fromMe), m.author ?? null,
       m.contact?.name ?? m.contact?.pushName ?? null,
       m.type ?? "text", m.body ?? null, m.quotedMessage?.id ?? null, m.timestamp || 0],
    );
    ultimo = m.id;
  }
  // O cursor aqui é MARCA DE "já foi buscada", não posição de keyset: esta rota
  // sempre devolve as N mais recentes. Guardar a última vista mantém a coluna
  // útil (dá para ver se mudou) sem prometer paginação que a rota não tem.
  await query(
    `UPDATE whatsapp_conversations SET sync_cursor = COALESCE($2, sync_cursor, $3), synced_at = now(), updated_at = now()
      WHERE id = $1`,
    [conversaId, ultimo, "vazia"],
  );
  return mensagens.length;
}

/**
 * Uma conversa ainda não sincronizada avança por leitura, mais recente
 * primeiro. Mesmo padrão do envio em massa e do plano efetivo: o projeto não
 * tem tarefa agendada, então quem avança é quem olha.
 */
export async function avancarSincronizacao(conexao: Conexao, quantas = 3) {
  const { rows } = await query<{ id: string; chat_id: string }>(
    `SELECT id, chat_id FROM whatsapp_conversations
      WHERE organization_id = $1 AND sync_cursor IS NULL
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT ${quantas}`,
    [conexao.organizationId],
  );
  for (const c of rows) {
    await sincronizarMensagens(conexao, c.id, c.chat_id, null).catch(() => undefined);
  }
  return rows.length;
}

export type EstadoSync = {
  state: "never_synced" | "syncing" | "idle";
  chatsConhecidos: number;
  chatsSincronizados: number;
  lastSyncAt: string | null;
};

/**
 * O bloco que impede o vazio mentiroso.
 *
 * A tela só mostra "não há conversa" com `state === "idle" && total === 0`. Em
 * qualquer outro caso ela mostra progresso COM DENOMINADOR -- "34 de 210" --,
 * porque sem denominador progresso é só uma ampulheta.
 *
 * POR QUE ISTO É HEURÍSTICA, escrito aqui para ninguém procurar de novo.
 *
 * `syncing` é deduzido de "há conversa conhecida ainda não sincronizada", e não
 * de um aviso do outro lado. Procurei o aviso; ele não existe para nós, e por
 * três motivos que se somam:
 *
 * 1. O motor é o **whatsapp-web.js** (`ENGINE_TYPE` indefinido, e o padrão é
 *    ele). O adaptador dele NÃO TEM `onHistoryMessages`: o WhatsApp Web não
 *    empurra histórico ao vincular um aparelho, ele responde a `fetchMessages`
 *    conversa por conversa. Não há um "acabou" porque não há um começo.
 * 2. O único motor que emite algo assim é o **Baileys**, com
 *    `messaging-history.set` -- e trocar de motor por causa disto foi decidido
 *    que não. Fica registrado para ninguém "descobrir" o evento no código do
 *    OpenWA e concluir que dá para usar: dá, no outro motor.
 * 3. Ainda que existisse, seria evento de DISPARO ÚNICO. O nonia lê por
 *    requisição, sem processo vivo escutando: um evento que passa enquanto
 *    ninguém olha não vira resposta de API. O que serviria é um CARIMBO
 *    CONSULTÁVEL -- uma data que o OpenWA guarde e que a gente possa perguntar
 *    depois --, e é isso que a condição de reabertura pede.
 *
 * **Reabrir quando** o OpenWA expuser um carimbo consultável de fim de
 * sincronização. Evento novo, sozinho, não basta.
 *
 * Enquanto isso a heurística FICA, porque o erro dela é para o lado seguro:
 * dizer "trazendo" para uma caixa que já acabou custa uma tela de progresso a
 * mais; dizer "não há conversa" para uma que está chegando faz a igreja achar
 * que o pareamento não funcionou.
 */
export async function estadoSync(organizationId: string): Promise<EstadoSync> {
  const { rows } = await query<{
    chats_known: number; chats_synced_at: string | null; sincronizadas: number; conhecidas: number;
  }>(
    `SELECT w.chats_known, w.chats_synced_at,
            (SELECT count(*)::int FROM whatsapp_conversations c
              WHERE c.organization_id = w.organization_id AND c.sync_cursor IS NOT NULL) AS sincronizadas,
            (SELECT count(*)::int FROM whatsapp_conversations c
              WHERE c.organization_id = w.organization_id) AS conhecidas
       FROM organization_whatsapp w WHERE w.organization_id = $1`,
    [organizationId],
  );
  const linha = rows[0];
  if (!linha || !linha.chats_synced_at) {
    return { state: "never_synced", chatsConhecidos: 0, chatsSincronizados: 0, lastSyncAt: null };
  }
  const faltam = linha.conhecidas - linha.sincronizadas;
  return {
    state: faltam > 0 ? "syncing" : "idle",
    chatsConhecidos: linha.conhecidas,
    chatsSincronizados: linha.sincronizadas,
    lastSyncAt: linha.chats_synced_at,
  };
}

/**
 * Teto de sanidade da resposta individual: 30 por minuto por igreja.
 *
 * O intervalo de 3 s do disparo em massa NÃO se aplica aqui -- resposta é uma
 * pessoa digitando, e travar gente entre uma resposta e outra seria uma trava
 * sem ameaça correspondente. O que este teto pega é AUTOMAÇÃO: 30/min é uma
 * mensagem a cada 2 segundos sustentada por um minuto inteiro, que nenhuma
 * secretária alcança e que qualquer laço bate na hora.
 *
 * Contado da TABELA e não de memória: sobrevive a reinício, não precisa de
 * contador próprio e o índice já existe. Mesma técnica que o OpenWA usa.
 */
export const TETO_RESPOSTAS_POR_MINUTO = 30;

export async function assertPodeResponder(organizationId: string) {
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM whatsapp_messages
      WHERE organization_id = $1 AND from_me AND created_at > now() - interval '1 minute'`,
    [organizationId],
  );
  if (rows[0].n >= TETO_RESPOSTAS_POR_MINUTO) {
    throw new HttpError(
      429,
      `Foram ${rows[0].n} mensagens no último minuto, que é o limite. Ele existe para o número da ` +
        "igreja não ser bloqueado por parecer um robô. Espere um instante e continue.",
      "whatsapp_too_fast",
      { limit: TETO_RESPOSTAS_POR_MINUTO },
    );
  }
}

/**
 * GRAVA O QUE A IGREJA MANDOU, num lugar só.
 *
 * Responder, encaminhar e mandar mídia são três rotas e a mesma consequência:
 * uma linha em `whatsapp_messages`, a conversa subindo para o topo com prévia
 * nova, o não-lido zerado e a atividade registrada. Três cópias disso
 * divergiriam no primeiro dia em que alguém mexesse em uma -- e a divergência
 * apareceria como "encaminhei e a conversa não subiu na lista", que ninguém
 * liga a um `UPDATE` esquecido.
 *
 * A prévia é calculada pela MESMA função que calcula a das recebidas, senão a
 * lista mostraria linha vazia para a foto que a própria igreja enviou.
 */
export async function registrarEnviada(
  actor: Parameters<typeof addActivity>[1],
  conversa: { id: string; organizationId: string; nome: string | null },
  mensagem: {
    waMessageId: string;
    type: string;
    body?: string | null;
    quotedWaMessageId?: string | null;
    mediaMimetype?: string | null;
    mediaFilename?: string | null;
  },
  acao: string,
) {
  const resumo = previa(mensagem.type, mensagem.body);
  await db.transaction(async (transaction) => {
    await db.query(
      `INSERT INTO whatsapp_messages
         (conversation_id, organization_id, wa_message_id, from_me, type, body,
          quoted_wa_message_id, media_mimetype, media_filename, sent_at)
       VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, now())
       ON CONFLICT (organization_id, wa_message_id) DO NOTHING`,
      {
        bind: [conversa.id, conversa.organizationId, mensagem.waMessageId, mensagem.type,
               mensagem.body ?? null, mensagem.quotedWaMessageId ?? null,
               mensagem.mediaMimetype ?? null, mensagem.mediaFilename ?? null],
        transaction,
      },
    );
    await db.query(
      `UPDATE whatsapp_conversations
          SET last_message_at = now(), last_message_preview = $2, unread_count = 0, updated_at = now()
        WHERE id = $1`,
      { bind: [conversa.id, resumo], transaction },
    );
    await addActivity(transaction, actor, "whatsapp", acao, conversa.nome);
  });
}

/**
 * A mensagem citada precisa ser DESTA conversa, e a checagem é de segurança,
 * não de arrumação.
 *
 * O balão que o WhatsApp entrega mostra o texto da citada dentro dele. Aceitar
 * um id qualquer faria a igreja mandar para fora, sem perceber, um trecho de
 * outra conversa -- e, com um id de outra organização, de outra igreja. É o
 * mesmo cuidado de `assertBelongsToOrganization`, aplicado a um id que não é
 * nosso: filtramos por (conversa, organização) e não pelo id sozinho.
 *
 * 404 e não 403 pelo mesmo motivo do resto do projeto: confirmar que o id
 * existe já contaria algo sobre a outra igreja.
 */
export async function exigirCitadaDaConversa(
  conversaId: string,
  organizationId: string,
  waMessageId: unknown,
): Promise<string | null> {
  if (waMessageId === undefined || waMessageId === null || waMessageId === "") return null;
  if (typeof waMessageId !== "string") {
    throw badRequest("A mensagem citada precisa ser identificada por texto.", "quoted_invalid");
  }
  const { rows } = await query<{ wa_message_id: string }>(
    `SELECT wa_message_id FROM whatsapp_messages
      WHERE organization_id = $1 AND conversation_id = $2 AND wa_message_id = $3`,
    [organizationId, conversaId, waMessageId],
  );
  if (!rows[0]) {
    throw new HttpError(404, "A mensagem citada não é desta conversa.", "quoted_not_found");
  }
  return rows[0].wa_message_id;
}

export function exigirTexto(texto: unknown): string {
  const t = typeof texto === "string" ? texto.trim() : "";
  if (!t) throw badRequest("Escreva a mensagem antes de enviar.", "message_required");
  if (t.length > 4096) throw badRequest("A mensagem passa de 4096 caracteres, que é o limite do WhatsApp.", "message_too_long");
  return t;
}
