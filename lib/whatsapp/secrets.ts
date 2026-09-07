import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Cifra a chave do OpenWA para guardar no banco.
 *
 * É a PRIMEIRA credencial reversível do projeto, e vale dizer por quê: senha é
 * scrypt e sessão é SHA-256 -- nenhuma das duas volta, porque nenhuma precisa
 * voltar. Esta precisa: ela é reenviada ao OpenWA a cada chamada.
 *
 * Guardar em claro daria a quem lê um dump do banco a capacidade de mandar
 * mensagem em nome de TODA igreja conectada. Daí AES-256-GCM com a chave vindo
 * do ambiente: o banco sozinho não basta.
 *
 * O GCM é escolha, não gosto: ele autentica o texto cifrado, então um valor
 * adulterado no banco falha ao decifrar em vez de virar uma chave silenciosamente
 * errada -- que produziria um 401 do OpenWA sem ninguém entender de onde veio.
 */

/** Exportado para o 503 poder DIZER qual variável falta, em vez de só "não configurada". */
export const NOME_DO_SEGREDO = "WHATSAPP_KEY_SECRET";
const NOME_DA_VARIAVEL = NOME_DO_SEGREDO;
const SAL = "nonia:whatsapp:v1";

export class WhatsAppSecretMissing extends Error {
  constructor() {
    super(
      `${NOME_DA_VARIAVEL} não está definida. A conexão com o WhatsApp precisa dela ` +
        "para guardar a chave do OpenWA cifrada, e não existe gravação em claro como alternativa.",
    );
  }
}

/**
 * Sem a variável, a conexão RECUSA existir. Não há degradação silenciosa para
 * texto claro: é o mesmo critério do guarda-corpo do bypass -- ausência da
 * variável desliga o recurso, não afrouxa a garantia.
 */
export function whatsappSecretConfigurado(): boolean {
  const valor = process.env[NOME_DA_VARIAVEL];
  return typeof valor === "string" && valor.length >= 16;
}

function chave(): Buffer {
  const valor = process.env[NOME_DA_VARIAVEL];
  if (!valor || valor.length < 16) throw new WhatsAppSecretMissing();
  return scryptSync(valor, SAL, 32);
}

/** `v1.<iv>.<tag>.<cifrado>`, tudo em base64url. O prefixo permite trocar o esquema depois. */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), cifrado.toString("base64url")].join(".");
}

export function decifrar(guardado: string): string {
  const [versao, iv, tag, cifrado] = guardado.split(".");
  if (versao !== "v1" || !iv || !tag || !cifrado) {
    throw new Error("Chave do WhatsApp guardada em formato desconhecido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(cifrado, "base64url")), decipher.final()]).toString("utf8");
}
