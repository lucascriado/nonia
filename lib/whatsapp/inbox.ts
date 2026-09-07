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
  // Aviso do WhatsApp, não mensagem de gente. Fica fora da conversa; ver `tipoParaGuardar`.
  system: "[aviso do WhatsApp]",
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

/**
 * EM QUAIS TIPOS O `body` É LEGENDA DE GENTE -- e a resposta não é opinião
 * minha, está numa linha do whatsapp-web.js:
 *
 *     this.body = this.hasMedia
 *       ? data.caption || ''
 *       : data.body || data.pollName || data.eventName || '';
 *
 * Ou seja: **o `body` só é legenda quando a mensagem tem MÍDIA.** Sem mídia ele
 * é o `data.body` cru do WhatsApp, que é texto de gente em `text`, é a pergunta
 * em `poll` (`pollName`) -- e é A CARGA DA MENSAGEM em todo o resto.
 *
 * Foi isso que colocou 300 caracteres de base64 de JPEG ao lado do nome de um
 * contato na tela do Lucas: tipo `unknown`, sem mídia declarada, `data.body`
 * com o arquivo inteiro dentro, e a regra da legenda aplicada a ele.
 *
 * A regra antiga acertava a metade que alguém foi olhar (foto com legenda) e
 * errava a que ninguém pediu para olhar. A lista abaixo é BRANCA de propósito,
 * pelo mesmo motivo do `isWrite` invertido em lib/auth.ts: os dois erros não
 * custam igual. Deixar um tipo de fora perde uma legenda e o marcador continua
 * honesto; deixar um tipo entrar por engano põe carga binária na tela. Tipo
 * novo do WhatsApp cai fora sozinho, que é o lado certo para cair.
 */
const TIPOS_COM_LEGENDA = new Set([...Object.keys(TIPOS_COM_MIDIA), "poll"]);

/**
 * O QUE VALE GUARDAR DO `body`, e isto é mais que arrumação: é o mesmo defeito
 * que a prévia, um passo antes.
 *
 * Medido na conta real em 07/09/2026: a única mensagem do chat "WhatsApp
 * Business" é do tipo `unknown` e traz **78.336 caracteres** de base64 de um
 * JPEG no `body`. Guardando o corpo cru, aquele JPEG inteiro ia parar em
 * `whatsapp_messages.body` -- exatamente a doença que o cabeçalho da 015 existe
 * para recusar, a mesma que fez as listagens chegarem a 43 MB. A mídia não é
 * copiada pela porta da frente e estava entrando pela janela.
 *
 * Mesma regra da prévia, de propósito: onde o corpo não é legenda de gente, ele
 * não é texto nosso para guardar. Uma regra só, nos dois lugares.
 */
/**
 * O TIPO A GRAVAR -- e existe um tipo que o OpenWA não tem: `system`.
 *
 * MEDIDO na conta real em 07/09/2026, e o número é o argumento: das 2.300
 * mensagens carregadas, **224 são `unknown`** -- o terceiro tipo mais comum. E
 * elas não estão espalhadas: um grupo tinha 155 de 155, outro 10 de 10. Duas
 * conversas do Lucas abriam como uma parede de "[mensagem não suportada]", da
 * primeira linha à última.
 *
 * O que separa uma coisa da outra é uma medida limpa: **TODA `unknown` de grupo
 * veio com o corpo VAZIO** -- 100/100, 9/9, 6/6, 4/4, 1/1, nos oito grupos
 * medidos. Corpo vazio e tipo que ninguém sabe ler é uma linha sem conteúdo
 * NENHUM: não há o que mostrar, e mostrar "[mensagem não suportada]" 155 vezes
 * é ruído honesto, que continua sendo ruído.
 *
 * Já a `unknown` COM corpo é outra coisa: no chat "WhatsApp Business" ela
 * trazia 78.336 caracteres -- um JPEG inteiro. Ali existe conteúdo, ainda que a
 * gente não saiba abri-lo, e o marcador é a resposta certa.
 *
 * Por isso a divisão é pelo CORPO e não por um palpite sobre o que a mensagem é.
 * Não sei se são avisos de grupo, notificação de criptografia ou reação: o
 * OpenWA colapsa tudo o que não mapeia num `unknown` só, e o tipo cru do motor
 * morre no `default` do `mapWwebjsMessageType` sem ser registrado. Enquanto
 * ninguém do lado de lá expuser o tipo cru, "sem corpo" é o que dá para medir,
 * e é o que está escrito aqui em vez de um palpite disfarçado de certeza.
 *
 * Elas continuam GRAVADAS. Some da lista de mensagens, não do banco: a conversa
 * informa quantas foram omitidas, porque conversa que encolhe sem explicação é
 * o mesmo vazio que mente com outra roupa.
 */
export function tipoParaGuardar(tipo: string, corpo: string | null | undefined): string {
  if (tipo === "unknown" && !(corpo ?? "").trim()) return "system";
  return tipo;
}

export function corpoParaGuardar(tipo: string, corpo: string | null | undefined): string | null {
  if (tipo !== "text" && !TIPOS_COM_LEGENDA.has(tipo)) return null;
  return corpo ?? null;
}

export function previa(tipo: string, corpo: string | null | undefined): string {
  const texto = (corpo ?? "").trim();
  if (tipo === "text") return texto.slice(0, 300);
  const marca = MARCADOR[tipo] ?? MARCADOR.unknown;
  // Foto COM legenda mostra as duas coisas: a legenda é conteúdo de verdade.
  // Fora da lista, o marcador vai SOZINHO -- "[mensagem não suportada]" já é
  // uma frase inteira e honesta, e colar a carga no fim dela não acrescenta
  // informação nenhuma a quem lê.
  if (!TIPOS_COM_LEGENDA.has(tipo)) return marca;
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
 * GRUPO: AGORA MEDIDO CONTRA GRUPOS DE VERDADE. Antes aqui havia um aviso em
 * caixa alta dizendo que nada disto tinha sido exercitado -- a conta pareada não
 * tinha nenhum grupo. Em 07/09/2026 ela passou a ter 16, e o aviso saiu porque
 * a medição chegou. O que ela disse, número por número:
 *
 *  - `kind` = "group" e chatId terminando em `@g.us`: **8 de 8** grupos
 *    conferidos. `kind` sai do `isGroup` do OpenWA, não de palpite sobre o
 *    sufixo do id, e os dois concordaram em todos.
 *  - `author` preenchido em **655 de 655** mensagens reais de grupo. É dele que
 *    tudo aqui depende -- em grupo o remetente do chat é o GRUPO --, e ele veio
 *    em todas.
 *  - `author` VAZIO em conversa individual: 0 de 30 e 0 de 15 nas duas
 *    conferidas. O discriminador vale para os dois lados, que é o que faz dele
 *    um discriminador e não uma coincidência.
 *  - `resolverTelefonesPendentes` pula grupo, e continua certo: grupo não tem
 *    telefone, e vincular pessoa do cadastro não se aplica.
 *
 * E A MEDIÇÃO ACHOU UM BURACO, que é o motivo de ela valer mais que o aviso que
 * estava aqui: **`author_name` veio vazio em 655 de 655**. O nome que eu leio de
 * `contact.pushName` vem do `notifyName` do payload cru, que existe no evento AO
 * VIVO e **não** no histórico lido por `fetchMessages` -- e o histórico é
 * justamente por onde a caixa carrega tudo. Ou seja: o campo que existe para o
 * grupo não virar um monte de balão sem dono está nulo em todo grupo real.
 *
 * O conserto é o mesmo padrão do `@lid`: resolver o `author` para um nome pela
 * rota de contato do OpenWA, sob demanda, com teto e com memória. Está anotado
 * e não feito -- e fica anotado aqui, e não numa lista fora do código, porque
 * quem for mexer em grupo é quem precisa saber disto.
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
       tipoParaGuardar(m.type ?? "text", m.body),
       corpoParaGuardar(m.type ?? "text", m.body), m.quotedMessage?.id ?? null, m.timestamp || 0],
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

/**
 * O NOME DE QUEM FALOU NUM GRUPO, resolvido sob demanda.
 *
 * Mesmo desenho do `@lid`, e pela mesma razão: é UMA REQUISIÇÃO DE REDE POR
 * PARTICIPANTE. Sob demanda (só ao abrir a conversa), com teto (alguns por
 * abertura) e com memória (`whatsapp_contacts`) -- sem a memória, um grupo de
 * 200 pessoas vira 200 consultas toda vez que alguém abre a conversa, para
 * sempre, inclusive para quem nunca vai resolver.
 *
 * A LINHA EXISTIR é a memória. `name` NULL é resposta -- perguntamos e o motor
 * não soube --, e é diferente de não ter perguntado, que é a linha não existir.
 * Sem essa distinção, "não sei o nome dele" viraria uma pergunta eterna.
 *
 * Resolve os autores DESTA conversa, e não os da igreja inteira: quem abriu um
 * grupo quer os nomes daquele grupo. Uma varredura global gastaria rede com
 * conversas que ninguém está olhando -- o mesmo "quem avança é quem olha" do
 * resto do projeto.
 */
export async function resolverNomesDeAutores(conexao: Conexao, conversaId: string, quantos = 20) {
  const { rows } = await query<{ author: string }>(
    `SELECT DISTINCT m.author FROM whatsapp_messages m
       LEFT JOIN whatsapp_contacts c
              ON c.organization_id = m.organization_id AND c.wa_id = m.author
      WHERE m.conversation_id = $1 AND m.organization_id = $2
        AND m.author IS NOT NULL AND m.author_name IS NULL
        AND c.wa_id IS NULL
      LIMIT ${quantos}`,
    [conversaId, conexao.organizationId],
  );
  let resolvidos = 0;
  for (const { author } of rows) {
    let nome: string | null = null;
    try {
      const contato = await openwa.lerContato(conexao.sessionId, conexao.apiKey, author);
      nome = contato.name?.trim() || contato.pushName?.trim() || null;
    } catch {
      // Segue para o próximo. Um participante que o motor não conhece não pode
      // impedir os outros de ganharem nome.
    }
    // Gravada mesmo com nome nulo: é a marca de "já perguntei". Sem ela, este
    // mesmo autor voltaria na consulta acima a cada abertura da conversa.
    await query(
      `INSERT INTO whatsapp_contacts (organization_id, wa_id, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, wa_id) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, whatsapp_contacts.name),
         looked_up_at = now(), updated_at = now()`,
      [conexao.organizationId, author, nome],
    );
    if (nome) resolvidos += 1;
  }
  return resolvidos;
}

/**
 * "CONECTADO" NÃO É "RECEBENDO", e este bloco existe porque a diferença apareceu
 * na prática.
 *
 * O `connected` da caixa é derivado de conseguir LISTAR conversas -- e a troca
 * foi certa, porque a coluna `status` gravada envelhecia e a tela dizia
 * "desconectado" para igreja conectada. O erro que sobrou é o simétrico: em
 * 07/09/2026 o WhatsApp Web foi aberto em outra janela e assumiu o número; a
 * sessão do serviço ficou DESVINCULADA -- continuou respondendo consulta do
 * armazenamento local dela e continuou marcada como `ready` --, e ficou 70
 * minutos sem receber uma única mensagem numa conta com 116 conversas. Listar
 * funcionava. Receber, não. A tela dizia "conectado".
 *
 * O sinal honesto disponível HOJE é comparar a última movimentação da caixa com
 * o relógio. E QUAL COLUNA responde isso é a parte que já errei uma vez:
 *
 * "ÚLTIMA MENSAGEM" EXISTE EM DOIS LUGARES NESTE BANCO, COM FRESCURAS
 * DIFERENTES, E O MAIS ÓBVIO É O ERRADO.
 *
 *   whatsapp_messages.sent_at        parece o dado certo, e não é. A tabela de
 *                                    mensagens só avança quando alguém ABRE uma
 *                                    conversa -- `avancarSincronizacao` empurra
 *                                    três por leitura, de propósito. Ela mede A
 *                                    NOSSA DEFASAGEM DE SINCRONIZAÇÃO, não o
 *                                    movimento da caixa.
 *   whatsapp_conversations.last_message_at  acompanha o gateway a cada leitura
 *                                    da LISTA, que é a primeira coisa que a tela
 *                                    faz. É este.
 *
 * Foi um caso real que separou os dois: em 07/09/2026, com a sessão já
 * restabelecida e conversa de 16:39 na lista, o campo tirado de
 * `whatsapp_messages` dizia "96 minutos sem receber" -- porque ninguém tinha
 * aberto conversa nenhuma desde as 15:10. Trocaríamos um selo que mentia
 * dizendo "conectado" por uma frase que mente dizendo "parado". As duas colunas
 * parecem a mesma coisa e não são; quem mexer aqui vai achar que são.
 *
 * O QUE ESTE CAMPO CONTA, DITO SEM ENFEITE: a última vez que o serviço nos
 * mostrou movimento em alguma conversa. Isso INCLUI o que a própria igreja
 * enviou, e eu tinha excluído envio de propósito -- porque envio sai desta
 * máquina e "andaria" numa sessão desvinculada. **Fui conferir e o argumento
 * não se sustenta:** `registrarEnviada` só grava DEPOIS de o gateway aceitar a
 * mensagem, e numa sessão desvinculada toda escrita falha com 503. Um envio
 * nosso que chega a mexer nesta coluna já é prova de que o gateway está vivo.
 * Então incluir envio não estraga o sinal -- e o recorte que eu tinha feito
 * custava o frescor, que era a única coisa que importava.
 *
 * O payload do chat NÃO diz se a última mensagem é `fromMe`: o
 * `ChatSummaryDto` do OpenWA traz `lastMessage` como texto puro, e o
 * `chat.lastMessage.fromMe` do whatsapp-web.js morre antes de chegar aqui.
 * Conferido no DTO e no adaptador, não suposto. Se um dia ele expuser, dá para
 * ter frescor E o recorte -- mas hoje é escolher, e a escolha está escrita
 * acima em vez de feita em silêncio.
 *
 * SOBRE O LIMIAR, e ele é um contorno, não uma verdade do domínio:
 *
 * Três horas é um número ESCOLHIDO, não medido, e está escrito assim para que
 * ninguém daqui a três meses o defenda como se fosse regra de negócio. O que o
 * sustenta é a assimetria dos dois erros: avisar cedo demais custa uma frase
 * que continua VERDADEIRA (uma igreja pequena pode passar a manhã sem mensagem,
 * e "sem mensagens novas desde 9h" é fato, não acusação), enquanto avisar tarde
 * demais custa um dia inteiro de caixa parada sem ninguém notar. Por isso o
 * campo devolve o FATO -- quando foi a última -- e não um veredito de "sessão
 * com problema", que seria falso justamente na igreja pequena.
 *
 * REMOVER QUANDO o OpenWA expuser o `WAState` do whatsapp-web.js. "Aberto em
 * outra janela" é exatamente `CONFLICT` lá dentro, e o `probeLiveness` de hoje
 * achata esse valor num booleano -- a página responde, porque não está travada,
 * está desvinculada. Com o WAState na mão, este limiar sai e vira uma pergunta
 * direta, com resposta certa em vez de inferida.
 */
export const LIMIAR_SILENCIO_MINUTOS = 180;

export type Recebimento = {
  /** A última movimentação que o serviço nos mostrou. NULL = nenhuma ainda. */
  ultimaEm: string | null;
  minutosSem: number | null;
  /** Só sugere MOSTRAR a frase. A frase é o fato, nunca "a sessão está quebrada". */
  avisar: boolean;
};

export async function estadoRecebimento(organizationId: string): Promise<Recebimento> {
  const { rows } = await query<{ ultima: string | null; minutos: number | null }>(
    // Da tabela de CONVERSAS, e não da de mensagens. Ver o bloco acima: a de
    // mensagens mede a nossa defasagem de sincronização, não o movimento.
    `SELECT max(last_message_at) AS ultima,
            floor(extract(epoch FROM now() - max(last_message_at)) / 60)::int AS minutos
       FROM whatsapp_conversations
      WHERE organization_id = $1`,
    [organizationId],
  );
  const linha = rows[0];
  return {
    ultimaEm: linha?.ultima ?? null,
    minutosSem: linha?.minutos ?? null,
    // Sem nenhuma movimentação não há silêncio a relatar: é caixa nova, e quem
    // responde por ela é o estado de sincronização, não este campo.
    avisar: linha?.minutos !== null && linha?.minutos !== undefined && linha.minutos >= LIMIAR_SILENCIO_MINUTOS,
  };
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

/**
 * A VALIDADE DA FOTO DE PERFIL, em dias.
 *
 * Sete, e o número sai de um trade-off e não de gosto. Cada re-checagem é uma
 * requisição de rede por contato; foto de perfil, por outro lado, é das coisas
 * que menos mudam num cadastro. Um dia transformaria a caixa num pooler contra
 * o WhatsApp; trinta faria a igreja olhar por um mês para a foto antiga de
 * alguém que acabou de trocar. Sete deixa a defasagem no tamanho de "uma
 * semana", que é o que uma foto de perfil merece.
 */
export const FOTO_VALIDADE_DIAS = 7;

/**
 * FOTO DE PERFIL DE UM PUNHADO DE IDS, com cache.
 *
 * ISTO NÃO É CHAMADO NA LISTAGEM DE CONVERSAS, e a separação é o ponto. As
 * outras resoluções sob demanda deste arquivo (telefone, nome de autor) rodam
 * dentro do GET da caixa, e ali cada uma custa uma requisição por conversa
 * ANTES de a tela ter o que desenhar. Foto não pode entrar nessa fila: ela é
 * enfeite de linha, e enfeite não segura a lista. Por isso mora numa rota
 * própria (`/api/whatsapp/fotos`), que a tela chama DEPOIS de já ter
 * desenhado a lista com as iniciais.
 *
 * O QUE A TELA MOSTRA ENQUANTO NÃO TEM FOTO: as iniciais, no mesmo círculo do
 * mesmo tamanho. Nunca um esqueleto e nunca um espaço vazio -- a foto chega
 * numa segunda requisição, e se ela empurrasse o layout a lista inteira daria
 * um pulo depois de a pessoa já estar lendo. As iniciais também são o destino
 * final de quem não tem foto, então na maioria das linhas não há troca nenhuma.
 *
 * TRÊS ESTADOS NO BANCO, e eles são diferentes (ver a migration 018):
 *   avatar_checked_at NULL  -> nunca perguntamos
 *   preenchido, url NULL    -> perguntamos e não há (ou é privada)
 *   preenchido, url ok      -> temos, e vale por FOTO_VALIDADE_DIAS
 *
 * O OPENWA FORA DO AR NÃO PODE APAGAR AS FOTOS DA TELA. Se a chamada falhar,
 * devolvemos o que já estava em cache -- inclusive vencido. Foto vencida é
 * melhor que avatar sumindo, e a rota nunca propaga erro: quem chama é uma tela
 * que já está desenhada.
 */
export async function fotosDePerfil(
  conexao: Conexao,
  ids: string[],
): Promise<Record<string, string | null>> {
  const pedidos = [...new Set(ids.map(id => id.trim()).filter(Boolean))];
  if (pedidos.length === 0) return {};

  const { rows } = await query<{ waId: string; avatarUrl: string | null; vencida: boolean }>(
    `SELECT wa_id AS "waId", avatar_url AS "avatarUrl",
            (avatar_checked_at IS NULL
             OR avatar_checked_at < now() - ($3 || ' days')::interval) AS vencida
       FROM whatsapp_contacts
      WHERE organization_id = $1 AND wa_id = ANY($2::varchar[])`,
    [conexao.organizationId, pedidos, String(FOTO_VALIDADE_DIAS)],
  );

  const resposta: Record<string, string | null> = {};
  const conhecidos = new Map(rows.map(r => [r.waId, r]));
  for (const id of pedidos) resposta[id] = conhecidos.get(id)?.avatarUrl ?? null;

  // Vencidos E nunca perguntados. Um id sem linha nenhuma é o caso mais comum
  // na primeira abertura da caixa.
  const aPerguntar = pedidos.filter(id => {
    const linha = conhecidos.get(id);
    return !linha || linha.vencida;
  });
  if (aPerguntar.length === 0) return resposta;

  // O corte é do outro lado (`PROFILE_PICTURES_MAX_IDS`), e lá o excedente é
  // ignorado EM SILÊNCIO. Cortar aqui é o que faz o excedente voltar na próxima
  // chamada em vez de virar um id que nunca é perguntado.
  const lote = aPerguntar.slice(0, openwa.FOTOS_MAX_IDS);

  let fotos: Record<string, string | null>;
  try {
    const resultado = await openwa.lerFotosDePerfil(conexao.sessionId, conexao.apiKey, lote);
    fotos = resultado.pictures ?? {};
  } catch {
    // Devolve o cache como está. Ver o bloco sobre o OpenWA fora do ar.
    return resposta;
  }

  for (const id of lote) {
    // O id pode não voltar no mapa (o outro lado só devolve o que perguntou).
    // Ausente e null são a mesma resposta para nós: não há foto agora.
    const url = fotos[id] ?? null;
    await query(
      `INSERT INTO whatsapp_contacts (organization_id, wa_id, avatar_url, avatar_checked_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (organization_id, wa_id) DO UPDATE SET
         avatar_url = COALESCE(EXCLUDED.avatar_url, whatsapp_contacts.avatar_url),
         avatar_checked_at = now(),
         updated_at = now()`,
      [conexao.organizationId, id, url],
    );
    // COALESCE, e não sobrescrita: o lote do OpenWA devolve null tanto para
    // "não tem foto" quanto para o id cuja consulta individual falhou ou
    // estourou os 8 s dele. Sobrescrever faria uma lentidão momentânea APAGAR
    // a foto de alguém, e a igreja veria o avatar piscar sem motivo.
    //
    // O preço, dito por inteiro: quem REMOVE a foto continua aparecendo com a
    // antiga. Não fica assim para sempre -- a URL do pps.whatsapp.net expira, e
    // quando expirar o onError da tela cai para as iniciais. É a segunda razão
    // de o onError ser obrigatório e não zelo: ele fecha este caso, e não só o
    // da URL vencida.
    //
    // Na PRIMEIRA pergunta não há o que preservar, então "perguntei e não há"
    // é gravado corretamente como url NULL com avatar_checked_at preenchido.
    if (url !== null) resposta[id] = url;
  }
  return resposta;
}
