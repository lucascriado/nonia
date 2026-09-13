// Login por e-mail e senha. O e-mail é único no sistema todo; quando o
// usuário pertence a mais de uma igreja, entra na organização padrão dele
// (ou na informada em organizationSlug) e troca depois por /api/auth/switch.
import { col, fn, where } from "sequelize";
import {
  createSession,
  jsonWithCookie,
  purgeStaleSessions,
  registrarSenhaErrada,
  requestMeta,
  resolveSession,
  sessionCookie,
} from "@/lib/auth";
import { sessionPayload } from "@/lib/auth-payloads";
import { HttpError, badRequest, forbidden, readJson, unauthorized } from "@/lib/http";
import { burnPasswordTime, verifyPassword } from "@/lib/passwords";
import { normalizeEmail } from "@/lib/organizations";
import { Organization, OrganizationMember, User } from "@/lib/models";
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

    // lower(email): é a expressão do índice único users_email_unique_idx.
    const user = await User.findOne({
      attributes: ["id", "passwordHash", "fullName", "status", "failedLoginAttempts", "lockedUntil"],
      where: where(fn("lower", col("email")), email),
      raw: true,
    }) as UserRow | null;

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
      // Incremento atômico no banco; ver registrarSenhaErrada em lib/auth.ts.
      await registrarSenhaErrada(user.id, { tentativas: MAX_FAILED_ATTEMPTS, minutos: LOCK_MINUTES });
      throw unauthorized("E-mail ou senha incorretos.", "invalid_credentials");
    }

    if (user.status !== "active") {
      throw forbidden("Este acesso está desativado. Fale com o responsável pela conta.", "user_disabled");
    }

    const vinculos = await OrganizationMember.findAll({
      attributes: ["organizationId"],
      where: { userId: user.id, status: "active" },
      include: [{ model: Organization, as: "organization", attributes: ["slug", "name"], where: { status: "active" }, required: true }],
      order: [["isDefault", "DESC"], ["joinedAt", "ASC"]],
      raw: true,
      nest: true,
    }) as unknown as { organizationId: string; organization: { slug: string; name: string } }[];
    const memberships = vinculos.map((item) => ({
      organizationId: item.organizationId,
      slug: item.organization.slug,
      name: item.organization.name,
    }));

    if (!memberships.length) {
      throw forbidden("Seu usuário não está vinculado a nenhuma igreja ativa.", "no_organization");
    }

    const wanted = payload.organizationSlug?.trim();
    const membership = wanted ? memberships.find((item) => item.slug === wanted) : memberships[0];
    if (!membership) {
      throw forbidden("Você não tem acesso a esta igreja.", "organization_not_allowed");
    }

    const session = await createSession(user.id, membership.organizationId, requestMeta(request));

    await User.update(
      { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
      { where: { id: user.id } },
    );

    // Limpeza oportunista: a tabela de sessões cresce para sempre e não há
    // tarefa agendada neste ambiente. Sem await e com catch, porque limpar
    // lixo NUNCA pode fazer alguém não conseguir entrar.
    void purgeStaleSessions().catch((error) => {
      console.error("[sessions] falha ao limpar sessões vencidas:", error);
    });

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
