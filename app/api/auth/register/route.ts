// Cadastro: cria a organização (tenant) e o usuário proprietário dela.
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { createSession, jsonWithCookie, requestMeta, resolveSession, sessionCookie } from "@/lib/auth";
import { badRequest, conflict, readJson } from "@/lib/http";
import { Organization, OrganizationMember, User } from "@/lib/models";
import { hashPassword, validatePasswordStrength } from "@/lib/passwords";
import { validarDocumento } from "@/lib/documents";
import { EMAIL_PATTERN, normalizeEmail, uniqueOrganizationSlug } from "@/lib/organizations";
import { sessionPayload } from "@/lib/auth-payloads";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

type RegisterPayload = {
  organizationName?: string;
  organizationSlug?: string;
  document?: string;
  fullName?: string;
  email?: string;
  password?: string;
  phone?: string;
};

export async function POST(request: Request) {
  try {
    const payload = await readJson<RegisterPayload>(request);

    const organizationName = payload.organizationName?.trim();
    const fullName = payload.fullName?.trim();
    const email = payload.email ? normalizeEmail(payload.email) : "";
    const password = payload.password ?? "";

    if (!organizationName) throw badRequest("Informe o nome da igreja.");
    if (!fullName) throw badRequest("Informe o seu nome completo.");
    if (!email || !EMAIL_PATTERN.test(email)) throw badRequest("Informe um e-mail válido.");

    const passwordError = validatePasswordStrength(password);
    if (passwordError) throw badRequest(passwordError, "weak_password");

    // O documento é opcional no cadastro, mas se vier tem que ser real: é o
    // único dado fiscal da igreja, e um número inválido guardado em silêncio
    // só aparece no dia em que alguém precisar dele.
    let documento: string | null = null;
    if (payload.document?.trim()) {
      const validado = validarDocumento(payload.document);
      if (!validado) throw badRequest("Informe um CNPJ ou CPF válido.", "invalid_document");
      documento = validado.formatado;
    }

    const existing = await db.query<{ id: string }>(`SELECT id FROM users WHERE lower(email) = $1`, {
      bind: [email],
      type: QueryTypes.SELECT,
    });
    if (existing.length) {
      throw conflict("Já existe uma conta com este e-mail.", "email_taken");
    }

    const passwordHash = await hashPassword(password);
    const meta = requestMeta(request);

    const result = await db.transaction(async (transaction) => {
      const slug = await uniqueOrganizationSlug(payload.organizationSlug || organizationName, transaction);

      const organization = await Organization.create(
        {
          name: organizationName,
          slug,
          document: documento,
          email,
          phone: payload.phone?.trim() || null,
        },
        { transaction },
      );

      const user = await User.create(
        {
          email,
          fullName,
          phone: payload.phone?.trim() || null,
          passwordHash,
          status: "active",
          lastLoginAt: new Date(),
        },
        { transaction },
      );

      const roles = await db.query<{ id: string }>(
        `SELECT id FROM roles WHERE organization_id IS NULL AND slug = 'owner'`,
        { transaction, type: QueryTypes.SELECT },
      );
      if (!roles.length) throw new Error("Papel 'owner' ausente: a migration 004 não foi aplicada.");

      await OrganizationMember.create(
        {
          organizationId: organization.id,
          userId: user.id,
          roleId: roles[0].id,
          status: "active",
          isDefault: true,
        },
        { transaction },
      );

      // Toda organização nasce em avaliação; a troca de plano virá com o gateway.
      await db.query(
        `INSERT INTO subscriptions (organization_id, plan_id, status, trial_ends_at)
         SELECT $1, p.id, 'trialing', now() + (p.trial_days || ' days')::interval
         FROM plans p WHERE p.slug = 'avaliacao'`,
        { bind: [organization.id], transaction },
      );

      await addActivity(
        transaction,
        { user: { id: user.id, fullName }, organization: { id: organization.id } },
        "system",
        "criou a organização",
        organizationName,
      );

      const session = await createSession(user.id, organization.id, meta, transaction);
      return { organization, user, session };
    });

    const auth = await resolveSession(result.session.token);
    if (!auth) throw new Error("Sessão criada mas não pôde ser lida de volta.");

    return jsonWithCookie(sessionPayload(auth), sessionCookie(result.session.token), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
