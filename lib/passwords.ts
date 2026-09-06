// Hash de senha com scrypt do node:crypto.
//
// Escolha do scrypt em vez de bcrypt/argon2: os dois exigem dependência
// nativa, que quebraria o build standalone do Next dentro do Dockerfile
// (`output: "standalone"` copia só o que o trace encontra) e adicionaria
// compilação ao deploy. O scrypt é KDF de memória dura, está na biblioteca
// padrão do Node e atende à recomendação do OWASP (N=2^15, r=8, p=1).
//
// O formato guardado inclui os parâmetros, então senhas antigas continuam
// verificáveis se os custos forem aumentados no futuro.

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const COST = { N: 32768, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
// 128 * N * r = 32 MB para os custos acima; o padrão do Node também é 32 MB
// e estouraria por causa do overhead interno.
const MAX_MEM = 96 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...COST, maxmem: MAX_MEM });
  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64"), derived.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const expected = Buffer.from(rawHash, "base64");
  const derived = await scrypt(password.normalize("NFKC"), Buffer.from(rawSalt, "base64"), expected.length, {
    N,
    r,
    p,
    maxmem: MAX_MEM,
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// Hash descartável usado no login quando o e-mail não existe, para que a
// resposta leve o mesmo tempo de uma senha errada e não vaze quais e-mails
// estão cadastrados.
const DUMMY_HASH = hashPassword("nonia-dummy-password");

export async function burnPasswordTime(password: string) {
  await verifyPassword(password, await DUMMY_HASH);
}

export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password.length > 200) return "A senha deve ter no máximo 200 caracteres.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "A senha deve conter letras e números.";
  }
  return null;
}
