// O usuário editando a SI MESMO.
//
// Rota própria, e não um caso especial dentro de PATCH /api/users/[id], de
// propósito. Aquela rota é para agir sobre TERCEIROS: exige users.write, e
// todas as guardas dela são recusas de agir sobre si (self_update,
// self_delete, self_password_reset). Enfiar "editar a si" lá dentro
// misturaria duas operações com donos e regras opostas, e o próximo a mexer
// teria que descobrir qual dos dois casos está lendo.
//
// Aqui não há permissão a checar: a pessoa age sobre a própria conta. Por
// isso também não passa pela guarda de somente leitura -- o nome e a foto de
// alguém são dele, não da igreja, e não ficam reféns de um pagamento
// atrasado.
//
// O e-mail NÃO é editável: ele é a identidade de login. Trocá-lo exigiria
// verificar o novo endereço, que não existe, e poderia colidir com outra
// conta ou deixar a pessoa sem acesso. A senha tem rota própria, que pede a
// senha atual: POST /api/auth/password.
import { requireSession } from "@/lib/auth";
import { User } from "@/lib/models";
import { badRequest, readJson } from "@/lib/http";
import { apiError, validatePhoto } from "@/lib/records";

export const runtime = "nodejs";

type ProfilePayload = {
  fullName?: string;
  phone?: string | null;
  avatarUrl?: string | null;
  email?: string;
};

export async function PATCH(request: Request) {
  try {
    const auth = await requireSession();
    const payload = await readJson<ProfilePayload>(request);

    if (payload.email !== undefined) {
      throw badRequest(
        "O e-mail de acesso não pode ser alterado por aqui.",
        "email_not_editable",
      );
    }

    const fullName = payload.fullName?.trim();
    if (payload.fullName !== undefined && !fullName) throw badRequest("Informe o seu nome.");

    const fotoInvalida = validatePhoto(payload.avatarUrl);
    if (fotoInvalida) throw badRequest(fotoInvalida, "invalid_photo");

    // Só entra no UPDATE o campo que veio no payload: ausente mantém o valor
    // atual, e `null` explícito (telefone, foto) limpa.
    const valores: { fullName?: string; phone?: string | null; avatarUrl?: string | null } = {};
    if (fullName != null) valores.fullName = fullName;
    if (payload.phone !== undefined) valores.phone = payload.phone?.trim() || null;
    if (payload.avatarUrl !== undefined) valores.avatarUrl = payload.avatarUrl?.trim() || null;

    await User.update(valores, { where: { id: auth.user.id } });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
