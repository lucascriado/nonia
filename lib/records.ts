import { HttpError } from "@/lib/http";

export type RecordPayload = {
  name: string;
  email?: string;
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
  // Mesma guarda da foto, e pela mesma razão: CHAVE AUSENTE PRESERVA. Enquanto
  // o e-mail era obrigatório, todo PATCH o mandava e a questão não existia.
  // Agora um PATCH que só mexe no telefone chegaria sem a chave, e escrever
  // null ali apagaria o e-mail de alguém sem ninguém ter pedido -- foi
  // exatamente o que quase aconteceu com a célula.
  const email = payload.email === undefined ? {} : { email: nullable(payload.email) };
  return {
    ...foto,
    ...email,
    fullName: payload.name.trim(),
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
  // E-mail é OPCIONAL desde a 014: o cadastro acontece no corredor da igreja,
  // com a pessoa na frente, e ela dá nome e telefone. Continua VALIDADO quando
  // vem preenchido -- opcional não é o mesmo que aceitar qualquer coisa.
  const email = payload.email?.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Informe um e-mail válido.";
  return validatePhoto(payload.photoDataUrl);
}

/** 23505 no índice de e-mail de `people` -- e só nele: outro único é outro assunto. */
function emailDuplicado(error: unknown): boolean {
  const alvo = error as { original?: { code?: string; constraint?: string }; parent?: { code?: string; constraint?: string } };
  const bruto = alvo?.original ?? alvo?.parent;
  return bruto?.code === "23505" && bruto?.constraint === "people_email_org_unique_idx";
}

export function apiError(error: unknown) {
  // Guardas de sessão e permissão lançam HttpError; o catch de cada rota
  // continua sendo um `apiError(error)` só, e o status certo sai daqui.
  if (error instanceof HttpError) {
    return Response.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
  }
  // E-mail repetido dentro da mesma igreja. Fica AQUI e não em cada rota
  // porque é o único lugar por onde todas passam -- espalhar seria confiar em
  // alguém lembrar na próxima rota que gravar pessoa.
  //
  // O caso real que isto atende é o casal que divide um e-mail: hoje ele
  // responde 500 "Não foi possível concluir a operação", que não diz o que
  // fazer. E ele fica MAIS comum agora que o campo é opcional, porque quem
  // preenche à mão na porta da igreja repete o e-mail da família.
  if (emailDuplicado(error)) {
    return Response.json(
      {
        error: "Já existe alguém nesta igreja com esse e-mail. O e-mail é opcional: " +
          "se as duas pessoas dividem a mesma caixa, deixe em branco em uma delas.",
        code: "email_taken",
      },
      { status: 409 },
    );
  }

  console.error(error);
  return Response.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
}
