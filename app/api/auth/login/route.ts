// Login por e-mail e senha. O e-mail é único no sistema todo; quando o
// usuário pertence a mais de uma igreja, entra na organização padrão dele
// (ou na informada em organizationSlug) e troca depois por /api/auth/switch.
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import { createSession, jsonWithCookie, requestMeta, resolveSession, sessionCookie } from "@/lib/auth";
import { sessionPayload } from "@/lib/auth-payloads";
import { HttpError, badRequest, forbidden, readJson, unauthorized } from "@/lib/http";
import { burnPasswordTime, verifyPassword } from "@/lib/passwords";
import { normalizeEmail } from "@/lib/organizations";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

type LoginPayload = { email?: string; password?: string; organizationSlug?: string };

type UserRow = {
  id: string;
  passwordHash: string | null;
  fullName: string;
  status: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
};

export async function POST(request: Request) {
  try {
    const payload = await readJson<LoginPayload>(request);
    const email = payload.email ? normalizeEmail(payload.email) : "";
    const password = payload.password ?? "";

    if (!email || !password) throw badRequest("Informe e-mail e senha.");

    const users = await db.query<UserRow>(
      `SELECT id, password_hash AS "passwordHash", full_name AS "fullName", status,
              failed_login_attempts AS "failedLoginAttempts", locked_until AS "lockedUntil"
       FROM users WHERE lower(email) = $1`,
      { bind: [email], type: QueryTypes.SELECT },
    );
    const user = users[0];

    if (!user) {
      // Consome o mesmo tempo de uma senha errada para não revelar
      // quais e-mails existem.
      await burnPasswordTime(password);
      throw unauthorized("E-mail ou senha incorretos.", "invalid_credentials");
    }

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      throw new HttpError(
        429,
        `Muitas tentativas. Tente novamente em ${LOCK_MINUTES} minutos.`,
        "too_many_attempts",
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);

    if (!valid) {
      await db.query(
        `UPDATE users
         SET failed_login_attempts = failed_login_attempts + 1,
             locked_until = CASE
               WHEN failed_login_attempts + 1 >= $2 THEN now() + make_interval(mins => $3::int)
               ELSE locked_until
             END
         WHERE id = $1`,
        { bind: [user.id, MAX_FAILED_ATTEMPTS, LOCK_MINUTES] },
      );
      throw unauthorized("E-mail ou senha incorretos.", "invalid_credentials");
    }

    if (user.status !== "active") {
      throw forbidden("Este acesso está desativado. Fale com o responsável pela conta.", "user_disabled");
    }

    const memberships = await db.query<{ organizationId: string; slug: string; name: string }>(
      `SELECT om.organization_id AS "organizationId", o.slug, o.name
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1 AND om.status = 'active' AND o.status = 'active'
       ORDER BY om.is_default DESC, om.joined_at ASC`,
      { bind: [user.id], type: QueryTypes.SELECT },
    );

    if (!memberships.length) {
      throw forbidden("Seu usuário não está vinculado a nenhuma igreja ativa.", "no_organization");
    }

    const wanted = payload.organizationSlug?.trim();
    const membership = wanted ? memberships.find((item) => item.slug === wanted) : memberships[0];
    if (!membership) {
      throw forbidden("Você não tem acesso a esta igreja.", "organization_not_allowed");
    }

    const session = await createSession(user.id, membership.organizationId, requestMeta(request));

    await db.query(
      `UPDATE users SET last_login_at = now(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      { bind: [user.id] },
    );

    const auth = await resolveSession(session.token);
    if (!auth) throw new Error("Sessão criada mas não pôde ser lida de volta.");

    return jsonWithCookie(
      {
        ...sessionPayload(auth),
        organizations: memberships.map((item) => ({
          id: item.organizationId,
          name: item.name,
          slug: item.slug,
        })),
      },
      sessionCookie(session.token),
    );
  } catch (error) {
    return apiError(error);
  }
}
