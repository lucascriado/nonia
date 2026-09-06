import { HttpError } from "@/lib/http";

export type RecordPayload = {
  name: string;
  email: string;
  phone?: string;
  birthDate?: string;
  gender?: string;
  civilStatus?: string;
  cpf?: string;
  zipCode?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  role?: string;
  ministry?: string;
  cell?: string;
  baptismDate?: string;
  status?: string;
  membershipStage?: string;
  notes?: string;
  invitedBy?: string;
  photoDataUrl?: string;
};

export const nullable = (value?: string) => value?.trim() || null;
export const PHOTO_MAX_BYTES = 120 * 1024;
const photoDataUrlPattern = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

/**
 * Atributos de `people` a partir do formulário.
 *
 * A foto tem tratamento diferente do resto: quando a CHAVE photoDataUrl não
 * vem no payload, o campo não entra no objeto e a foto existente fica intacta.
 * Só um null ou string vazia explícitos apagam.
 *
 * Isso é rede de segurança, não conveniência: desde que a listagem parou de
 * devolver a foto (ela custava 8,6 MB a cada 100 membros), um formulário que
 * abrisse sem carregar a pessoa por id salvaria sem a foto e a apagaria em
 * silêncio, num caminho que ninguém testa porque "só editei o telefone".
 */
export function personAttributes(payload: RecordPayload) {
  const foto = payload.photoDataUrl === undefined ? {} : { avatarUrl: nullable(payload.photoDataUrl) };
  return {
    ...foto,
    fullName: payload.name.trim(),
    email: payload.email.trim(),
    phone: nullable(payload.phone),
    birthDate: nullable(payload.birthDate),
    gender: nullable(payload.gender),
    maritalStatus: nullable(payload.civilStatus),
    cpf: nullable(payload.cpf),
    zipCode: nullable(payload.zipCode),
    address: nullable(payload.address),
    neighborhood: nullable(payload.neighborhood),
    city: nullable(payload.city),
    state: nullable(payload.state),
    notes: nullable(payload.notes),
  };
}

/** PNG ou JPG em base64, dentro do limite. Devolve a mensagem de erro ou null. */
export function validatePhoto(dataUrl: string | null | undefined): string | null {
  if (!dataUrl?.trim()) return null;
  if (!photoDataUrlPattern.test(dataUrl)) return "A foto deve ser PNG ou JPG.";
  if (Buffer.byteLength(dataUrl, "utf8") > PHOTO_MAX_BYTES) return "A foto deve ter no máximo 120 KB.";
  return null;
}

export function validateRecordPayload(payload: RecordPayload) {
  if (!payload.name?.trim()) return "Nome completo é obrigatório.";
  if (!payload.email?.trim()) return "E-mail é obrigatório.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) return "Informe um e-mail válido.";
  return validatePhoto(payload.photoDataUrl);
}

export function apiError(error: unknown) {
  // Guardas de sessão e permissão lançam HttpError; o catch de cada rota
  // continua sendo um `apiError(error)` só, e o status certo sai daqui.
  if (error instanceof HttpError) {
    return Response.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
}
