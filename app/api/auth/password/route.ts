// Troca da própria senha, com confirmação da senha atual.
//
// NÃO CONFUNDIR com a redefinição de PATCH /api/users/[id]. São coisas
// diferentes de propósito e não devem ser unificadas:
//
//   aqui                          | PATCH /api/users/[id]
//   -----------------------------|------------------------------------------
//   o dono da conta              | um responsável (users.write)
//   prova saber a senha ATUAL    | não prova nada -- é socorro
//   vale para si mesmo           | recusa a si mesmo (self_password_reset)
//   vale em multi-organização    | recusa multi-organização
//
// O que separa as duas é a senha atual. Sem ela, isto viraria "quem pegou uma
// sessão aberta troca a senha e toma a conta", que é exatamente o motivo de a
// redefinição sem confirmação estar restrita a um responsável.
import { db } from "@/lib/db";
import { Session, User } from "@/lib/models";
import { addActivity } from "@/lib/activities";
import {
  createSession,
  jsonWithCookie,
  registrarSenhaErrada,
  requestMeta,
  requireSession,
  sessionCookie,
} from "@/lib/auth";
import { HttpError, badRequest, readJson, unauthorized } from "@/lib/http";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/passwords";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

// Mesmos números do login: a senha atual aqui é tão sensível quanto lá, e um
// contador separado daria um caminho de força bruta sem trava.
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

type ChangePasswordPayload = { currentPassword?: string; newPassword?: string };

export async function POST(request: Request) {
  try {
    const auth = await requireSession();
    const payload = await readJson<ChangePasswordPayload>(request);

    const currentPassword = payload.currentPassword ?? "";
    const newPassword = payload.newPassword ?? "";

    if (!currentPassword || !newPassword) {
      throw badRequest("Informe a senha atual e a nova senha.");
    }

    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) throw badRequest(strengthError, "weak_password");

    const user = await User.findOne({
      attributes: ["passwordHash", "lockedUntil"],
      where: { id: auth.user.id },
      raw: true,
    });
    if (!user) throw unauthorized();

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      throw new HttpError(
        429,
        `Muitas tentativas. Tente novamente em ${LOCK_MINUTES} minutos.`,
        "too_many_attempts",
      );
    }

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      // Mesmo contador e mesma trava do login; ver registrarSenhaErrada.
      await registrarSenhaErrada(auth.user.id, { tentativas: MAX_FAILED_ATTEMPTS, minutos: LOCK_MINUTES });
      // Mesmo código do login, de propósito: quem errou não descobre por aqui
      // nada que não descobriria tentando entrar.
      throw unauthorized("Senha atual incorreta.", "invalid_credentials");
    }

    // A pessoa pode acessar mais de uma igreja, e pode trocar a senha mesmo
    // assim: a senha é da identidade dela, e ela acabou de provar que a sabe.
    // Quem não pode é um terceiro, e esse caso está barrado no PATCH.
    const passwordHash = await hashPassword(newPassword);
    const meta = requestMeta(request);

    const session = await db.transaction(async (transaction) => {
      await User.update(
        { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
        { where: { id: auth.user.id }, transaction },
      );

      // Revoga tudo e emite uma sessão nova, em vez de poupar a atual. É uma
      // regra só -- "senha nova invalida o que existia com a antiga" -- em vez
      // de uma regra com exceção, e ainda rotaciona o token de quem trocou.
      // O cookie da resposta repõe a sessão, então ninguém é deslogado.
      await Session.update(
        { revokedAt: new Date() },
        { where: { userId: auth.user.id, revokedAt: null }, transaction },
      );

      await addActivity(transaction, auth, "system", "alterou a própria senha");

      return createSession(auth.user.id, auth.organization.id, meta, transaction);
    });

    return jsonWithCookie({ ok: true }, sessionCookie(session.token));
  } catch (error) {
    return apiError(error);
  }
}
