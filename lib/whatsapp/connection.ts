import { HttpError, conflict, notFound } from "@/lib/http";
import { OrganizationWhatsapp } from "@/lib/models";
import * as openwa from "./openwa";
import { NOME_DO_SEGREDO, cifrar, decifrar, whatsappSecretConfigurado } from "./secrets";

/**
 * A conexão de UMA igreja com o WhatsApp.
 *
 * A regra que este arquivo existe para sustentar: **uma sessão por igreja**.
 * Uma sessão do WhatsApp é um número de telefone, e a mensagem que chega nele
 * não carrega nenhum campo que diga de qual igreja é. Sessão compartilhada não
 * tem desempate possível -- por isso `session_id` é UNIQUE no banco e por isso
 * a sessão NUNCA vem do payload: sai sempre da linha da organização da sessão.
 */

export type Conexao = {
  organizationId: string;
  sessionId: string;
  sessionName: string;
  apiKey: string;
  apiKeyId: string | null;
  status: string;
  phone: string | null;
  connectedAt: string | null;
};

export function whatsappDisponivel(): boolean {
  return openwa.openwaConfigurado() && whatsappSecretConfigurado();
}

/**
 * Recusa cedo e DIZENDO QUAL VARIÁVEL FALTA.
 *
 * A mensagem antiga era "não está configurada" e pronto -- as três variáveis
 * davam o mesmo 503. Custou tempo de verdade em 06/09/2026: com `OPENWA_URL` e
 * `OPENWA_ADMIN_KEY` no lugar e só a `WHATSAPP_KEY_SECRET` faltando, a resposta
 * não distinguia nada e a procura começou pelo lugar errado.
 *
 * O nome da variável não é segredo -- o valor é. Dizer qual falta é a diferença
 * entre um minuto e meia hora, e não conta nada a quem não deveria saber:
 * `OPENWA_URL` tem padrão e por isso não entra na lista.
 */
function exigirConfiguracao() {
  const faltando = [
    ...(openwa.openwaConfigurado() ? [] : ["OPENWA_ADMIN_KEY"]),
    ...(whatsappSecretConfigurado() ? [] : [`${NOME_DO_SEGREDO} (mínimo 16 caracteres)`]),
  ];
  if (faltando.length === 0) return;
  throw new HttpError(
    503,
    `A integração com o WhatsApp não está configurada neste ambiente: falta ${faltando.join(" e ")}.`,
    "whatsapp_not_configured",
    { faltando },
  );
}

export async function carregarConexao(organizationId: string): Promise<Conexao | null> {
  const linha = await OrganizationWhatsapp.findOne({
    attributes: [
      "organizationId", "sessionId", "sessionName", "apiKeyId", "apiKeyEncrypted", "status", "phone", "connectedAt",
    ],
    where: { organizationId },
    raw: true,
  });
  if (!linha) return null;
  return {
    organizationId: linha.organizationId,
    sessionId: linha.sessionId,
    sessionName: linha.sessionName,
    apiKey: decifrar(linha.apiKeyEncrypted),
    apiKeyId: linha.apiKeyId,
    status: linha.status,
    phone: linha.phone,
    connectedAt: linha.connectedAt as unknown as string | null,
  };
}

export async function exigirConexao(organizationId: string): Promise<Conexao> {
  exigirConfiguracao();
  const conexao = await carregarConexao(organizationId);
  if (!conexao) {
    throw new HttpError(
      409,
      "O WhatsApp desta igreja ainda não foi conectado. Conecte em Configurações antes de enviar.",
      "whatsapp_not_connected",
    );
  }
  return conexao;
}

/**
 * Cria a sessão e a chave restrita a ela, nesta ordem, e guarda a chave cifrada.
 *
 * Se a gravação falhar depois de a sessão existir no OpenWA, sobra sessão órfã
 * lá. É desconfortável e é a ordem menos ruim: o inverso -- gravar antes de
 * existir -- deixaria a igreja apontando para uma sessão que não existe, e essa
 * a tela não tem como consertar sozinha.
 */
export async function conectar(organizationId: string, slug: string): Promise<Conexao> {
  exigirConfiguracao();
  const existente = await carregarConexao(organizationId);
  if (existente) throw conflict("Esta igreja já tem um WhatsApp conectado.", "whatsapp_already_connected");

  const nome = `nonia-${slug}-${Date.now().toString(36)}`;
  const sessao = await openwa.criarSessao(nome);
  let chave: openwa.ChaveCriada;
  try {
    chave = await openwa.criarChaveDaSessao(`nonia ${slug}`, sessao.id);
  } catch (erro) {
    await openwa.apagarSessao(sessao.id).catch(() => undefined);
    throw erro;
  }

  await OrganizationWhatsapp.create({
    organizationId,
    sessionId: sessao.id,
    sessionName: nome,
    apiKeyId: chave.id ?? null,
    apiKeyEncrypted: cifrar(chave.apiKey),
    apiKeyPrefix: chave.keyPrefix ?? null,
    status: sessao.status ?? "created",
    phone: null,
    pushName: null,
    connectedAt: null,
    lastCheckedAt: null,
    chatsSyncedAt: null,
  });

  await openwa.iniciarSessao(sessao.id, chave.apiKey).catch(() => undefined);
  const conexao = await carregarConexao(organizationId);
  if (!conexao) throw new HttpError(500, "Não foi possível concluir a conexão.", "whatsapp_connect_failed");
  return conexao;
}

/**
 * Lê o estado no OpenWA e atualiza o cache local.
 *
 * Quem manda é o OpenWA: as colunas daqui são o último fato conhecido, para a
 * tela ter o que mostrar antes da primeira resposta. Não são a verdade.
 */
export async function sincronizar(conexao: Conexao) {
  const sessao = await openwa.lerSessao(conexao.sessionId, conexao.apiKey);
  await OrganizationWhatsapp.update(
    {
      status: sessao.status ?? "unknown",
      phone: sessao.phone ?? null,
      pushName: sessao.pushName ?? null,
      // Só quando o OpenWA informa: sem a data, a última conhecida fica.
      ...(sessao.connectedAt != null ? { connectedAt: new Date(sessao.connectedAt) } : {}),
      lastCheckedAt: new Date(),
    },
    { where: { organizationId: conexao.organizationId } },
  );
  return sessao;
}

/** `ready` é o único estado em que enviar funciona; todo o resto responde 400 lá. */
export const conectado = (status: string) => status === "ready";

export async function desconectar(conexao: Conexao) {
  await openwa.desconectarSessao(conexao.sessionId, conexao.apiKey).catch(() => undefined);
  if (conexao.apiKeyId) await openwa.revogarChave(conexao.apiKeyId).catch(() => undefined);
  await openwa.apagarSessao(conexao.sessionId).catch(() => undefined);
  const apagadas = await OrganizationWhatsapp.destroy({ where: { organizationId: conexao.organizationId } });
  if (!apagadas) throw notFound("Conexão não encontrada.");
}
