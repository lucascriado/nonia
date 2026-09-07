import { query } from "@/lib/db";
import { HttpError, conflict, notFound } from "@/lib/http";
import * as openwa from "./openwa";
import { cifrar, decifrar, whatsappSecretConfigurado } from "./secrets";

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
};

type Linha = {
  organization_id: string;
  session_id: string;
  session_name: string;
  api_key_id: string | null;
  api_key_encrypted: string;
  status: string;
  phone: string | null;
};

export function whatsappDisponivel(): boolean {
  return openwa.openwaConfigurado() && whatsappSecretConfigurado();
}

/** Recusa cedo e com o motivo certo, em vez de deixar estourar lá na frente. */
function exigirConfiguracao() {
  if (!whatsappDisponivel()) {
    throw new HttpError(
      503,
      "A integração com o WhatsApp não está configurada neste ambiente.",
      "whatsapp_not_configured",
    );
  }
}

export async function carregarConexao(organizationId: string): Promise<Conexao | null> {
  const { rows } = await query<Linha>(
    `SELECT organization_id, session_id, session_name, api_key_id, api_key_encrypted, status, phone
       FROM organization_whatsapp WHERE organization_id = $1`,
    [organizationId],
  );
  const linha = rows[0];
  if (!linha) return null;
  return {
    organizationId: linha.organization_id,
    sessionId: linha.session_id,
    sessionName: linha.session_name,
    apiKey: decifrar(linha.api_key_encrypted),
    apiKeyId: linha.api_key_id,
    status: linha.status,
    phone: linha.phone,
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

  await query(
    `INSERT INTO organization_whatsapp
       (organization_id, session_id, session_name, api_key_id, api_key_encrypted, api_key_prefix, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [organizationId, sessao.id, nome, chave.id ?? null, cifrar(chave.key), chave.keyPrefix ?? null, sessao.status ?? "created"],
  );

  await openwa.iniciarSessao(sessao.id, chave.key).catch(() => undefined);
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
  await query(
    `UPDATE organization_whatsapp
        SET status = $2, phone = $3, push_name = $4,
            connected_at = COALESCE($5, connected_at),
            last_checked_at = now(), updated_at = now()
      WHERE organization_id = $1`,
    [
      conexao.organizationId,
      sessao.status ?? "unknown",
      sessao.phone ?? null,
      sessao.pushName ?? null,
      sessao.connectedAt ?? null,
    ],
  );
  return sessao;
}

/** `ready` é o único estado em que enviar funciona; todo o resto responde 400 lá. */
export const conectado = (status: string) => status === "ready";

export async function desconectar(conexao: Conexao) {
  await openwa.desconectarSessao(conexao.sessionId, conexao.apiKey).catch(() => undefined);
  if (conexao.apiKeyId) await openwa.revogarChave(conexao.apiKeyId).catch(() => undefined);
  await openwa.apagarSessao(conexao.sessionId).catch(() => undefined);
  const { rows } = await query<{ organization_id: string }>(
    `DELETE FROM organization_whatsapp WHERE organization_id = $1 RETURNING organization_id`,
    [conexao.organizationId],
  );
  if (!rows.length) throw notFound("Conexão não encontrada.");
}
