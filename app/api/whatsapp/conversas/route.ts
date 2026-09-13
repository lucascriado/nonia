import { Op, col, fn, where, type WhereOptions } from "sequelize";
import { organizationId, requirePermission } from "@/lib/auth";
import { paginacao } from "@/lib/listings";
import { Person, WhatsappConversation, WhatsappMessage } from "@/lib/models";
import { apiError } from "@/lib/records";
import * as conn from "@/lib/whatsapp/connection";
import * as inbox from "@/lib/whatsapp/inbox";

export const runtime = "nodejs";

/**
 * A caixa de entrada desta igreja.
 *
 * A leitura é o que traz: consultar sincroniza a lista de conversas e empurra
 * algumas ainda não sincronizadas. O projeto não tem tarefa agendada, por
 * decisão registrada -- é o mesmo padrão do plano efetivo e do envio em massa.
 */
export async function GET(request: Request) {
  try {
    const auth = await requirePermission("whatsapp.read");
    const org = organizationId(auth);
    const { searchParams } = new URL(request.url);
    const { page, pageSize, offset } = paginacao(searchParams);

    const conexao = await conn.carregarConexao(org);
    if (!conexao) {
      return Response.json({
        records: [], total: 0, page, pageSize,
        sync: { state: "never_synced", chatsConhecidos: 0, chatsSincronizados: 0, lastSyncAt: null },
        connected: false,
      });
    }

    // Melhor esforço: o OpenWA fora do ar não pode impedir a igreja de VER o
    // que já foi trazido.
    let respondendo = true;
    try {
      await inbox.sincronizarConversas(conexao);
      await inbox.avancarSincronizacao(conexao);
      // Sem isto a caixa inteira aparece como "não identificado": esta conta
      // devolve TODAS as conversas como @lid, e @lid não carrega telefone.
      // Avança por leitura e com teto, como o resto -- é uma requisição ao
      // WhatsApp por conversa.
      await inbox.resolverTelefonesPendentes(conexao);
    } catch {
      respondendo = false;
    }

    const busca = searchParams.get("search")?.trim();
    // Tenant sempre na frente; os filtros da tela entram DEPOIS dele.
    const condicoes: WhereOptions[] = [{ organizationId: org }];
    if (busca) {
      // O nome do cadastro entra na busca: é por ele que a igreja procura.
      condicoes.push(where(
        fn("concat_ws", " ", col("WhatsappConversation.wa_name"), col("WhatsappConversation.phone"), col("person.full_name")),
        { [Op.iLike]: `%${busca}%` },
      ));
    }
    if (searchParams.get("unread") === "true") condicoes.push({ unreadCount: { [Op.gt]: 0 } });
    const filtro: WhereOptions = { [Op.and]: condicoes };
    // LEFT JOIN com a pessoa: a conversa não identificada continua na lista.
    const pessoa = { model: Person, as: "person", attributes: ["fullName"], where: { organizationId: org }, required: false };

    const total = await WhatsappConversation.count({
      include: [{ ...pessoa, attributes: [] }],
      where: filtro,
    });
    const conversas = await WhatsappConversation.findAll({
      attributes: ["id", "chatId", "kind", "phone", "waName", "personId", "lastMessageAt", "lastMessagePreview", "unreadCount", "syncCursor"],
      include: [pessoa],
      where: filtro,
      order: [["lastMessageAt", "DESC NULLS LAST"]],
      limit: pageSize,
      offset,
      raw: true,
      nest: true,
    }) as unknown as (WhatsappConversation & { person: { fullName: string | null } })[];

    // A ÚLTIMA MENSAGEM DE VERDADE de cada conversa da página, para a prévia da
    // lista sair da mesma função que a de dentro da conversa. Ver abaixo.
    //
    // Uma consulta por conversa, e só as da página: "a última de cada uma" não
    // cabe numa consulta de Model sem SQL escrito à mão, e a página tem no
    // máximo 100 linhas.
    const ultimas = await Promise.all(conversas.map((c) => WhatsappMessage.findOne({
      attributes: ["type", "body"],
      where: {
        conversationId: c.id,
        organizationId: org,
        // O mesmo corte da conversa: a prévia da lista tem que ser a última
        // mensagem DE GENTE, senão a conversa aparece como "[aviso do WhatsApp]"
        // enquanto a última fala foi um texto.
        type: { [Op.ne]: "system" },
      },
      order: [["sentAt", "DESC"], ["id", "DESC"]],
      raw: true,
    })));

    return Response.json({
      /**
       * A PRÉVIA DA LISTA SAI DA MESMA FUNÇÃO QUE A DE DENTRO DA CONVERSA.
       *
       * Antes ela vinha do `lastMessage` cru do chat, e o resultado era a MESMA
       * mensagem com dois textos: em branco na lista e "[foto]" dentro da
       * conversa. Foi o frontend que mediu, e ele fez o certo em não inventar
       * uma tabela de tipos do lado dele -- a tradução é do servidor e já
       * existia aqui.
       *
       * O campo cru não serve por mais um motivo, medido na conta real em
       * 07/09/2026: um dos chats devolve `lastMessage` com **78.336 caracteres**
       * e tipo `unknown`. Derivando, aquilo vira "[mensagem não suportada]" em
       * vez de 300 caracteres de lixo truncado.
       *
       * `null` quando não há mensagem sincronizada E o texto cru é vazio, e é
       * honesto: quer dizer "ainda não sabemos", não "a mensagem é vazia". Quem
       * lê tem o `synced` ao lado para distinguir os dois.
       */
      records: conversas.map((c, i) => {
        const ultima = ultimas[i];
        const nomeDoCadastro = c.person?.fullName ?? null;
        return {
          id: c.id,
          chatId: c.chatId,
          kind: c.kind,
          phone: c.phone,
          // Se a pessoa está cadastrada, o nome DELA ganha do nome do WhatsApp:
          // a igreja conhece a pessoa pelo cadastro.
          name: nomeDoCadastro ?? c.waName,
          personId: c.personId,
          naoIdentificado: nomeDoCadastro === null,
          lastMessageAt: c.lastMessageAt,
          unreadCount: c.unreadCount,
          synced: c.syncCursor !== null,
          preview: ultima?.type ? inbox.previa(ultima.type, ultima.body) : c.lastMessagePreview || null,
        };
      }),
      total,
      page,
      pageSize,
      // O bloco que impede o vazio mentiroso: a tela só mostra "não há conversa"
      // com state === "idle" && total === 0.
      sync: await inbox.estadoSync(org),
      // "Conectado" responde por LER; este campo responde por RECEBER. Uma
      // sessão desvinculada continua listando conversa e não recebe nada --
      // ver `estadoRecebimento`.
      recebimento: await inbox.estadoRecebimento(org),
      // DERIVADO de ter conseguido listar, não da coluna `status` gravada. A
      // coluna é atualizada pelas rotas de conexão; quem entra direto na caixa
      // depois de parear veria o valor velho e a tela diria "desconectado" para
      // uma igreja conectada. E listar conversas só funciona com a sessão
      // pronta -- o OpenWA responde 409 caso contrário --, então o sucesso da
      // listagem É a prova, e não um segundo palpite sobre ela.
      connected: respondendo ? true : conn.conectado(conexao.status),
    });
  } catch (error) {
    return apiError(error);
  }
}
