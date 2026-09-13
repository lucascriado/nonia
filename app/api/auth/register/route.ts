// Cadastro: cria a organização (tenant) e o usuário proprietário dela.
import { col, fn, where } from "sequelize";
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { createSession, jsonWithCookie, requestMeta, resolveSession, sessionCookie } from "@/lib/auth";
import { badRequest, conflict, readJson } from "@/lib/http";
import { User } from "@/lib/models";
import { hashPassword, validatePasswordStrength } from "@/lib/passwords";
import { validarDocumento } from "@/lib/documents";
import { criarOrganizacaoComDono, EMAIL_PATTERN, normalizeEmail } from "@/lib/organizations";
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

    const existing = await User.findOne({
      attributes: ["id"],
      where: where(fn("lower", col("email")), email),
      raw: true,
    });
    if (existing) {
      throw conflict("Já existe uma conta com este e-mail.", "email_taken");
    }

    const passwordHash = await hashPassword(password);
    const meta = requestMeta(request);

    const result = await db.transaction(async (transaction) => {
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

      // O mesmo miolo que POST /api/organizations usa. A diferença é só a
      // avaliação: quem chega pelo cadastro está experimentando o produto.
      const organization = await criarOrganizacaoComDono(
        {
          name: organizationName,
          slug: payload.organizationSlug,
          document: documento,
          email,
          phone: payload.phone?.trim() || null,
        },
        user.id,
        { comAvaliacao: true, isDefault: true },
        transaction,
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
