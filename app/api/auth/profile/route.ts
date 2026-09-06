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
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
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

    await db.query(
      `UPDATE users
       SET full_name = COALESCE($2, full_name),
           phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
           avatar_url = CASE WHEN $5::boolean THEN $6 ELSE avatar_url END
       WHERE id = $1`,
      {
        bind: [
          auth.user.id,
          fullName ?? null,
          payload.phone !== undefined, payload.phone?.trim() || null,
          payload.avatarUrl !== undefined, payload.avatarUrl?.trim() || null,
        ],
      },
    );

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
