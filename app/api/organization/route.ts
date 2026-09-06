// Dados cadastrais da igreja.
//
// Usa as permissões organization.read e organization.write, que existiam no
// banco desde a 004 sem nenhuma rota consultando -- permissão declarada e
// nunca usada é pior do que não existir, porque aparece no seletor de papéis
// prometendo um poder que não existe.
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { badRequest, readJson } from "@/lib/http";
import { validarDocumento } from "@/lib/documents";
import { EMAIL_PATTERN } from "@/lib/organizations";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrganizationPayload = {
  name?: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  slug?: string;
};

export async function GET() {
  try {
    const auth = await requirePermission("organization.read", "organization.write");

    const rows = await db.query(
      `SELECT id, name, slug, document, email, phone, status, created_at AS "createdAt"
       FROM organizations WHERE id = $1`,
      { bind: [organizationId(auth)], type: QueryTypes.SELECT },
    );

    return Response.json(rows[0]);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requirePermission("organization.write");
    const payload = await readJson<OrganizationPayload>(request);

    // O slug não é editável. Ele é identificador: entra no nome dos arquivos
    // exportados e é aceito no login e na troca de organização. Trocá-lo
    // invalidaria silenciosamente qualquer lugar que já o tenha guardado, e
    // hoje a igreja não o vê em tela nenhuma -- não poder editar não custa
    // nada, e liberar depois é fácil. Recusar é melhor que ignorar em
    // silêncio, que faria a pessoa achar que mudou.
    if (payload.slug !== undefined) {
      throw badRequest(
        "O endereço interno da organização não pode ser alterado.",
        "slug_not_editable",
      );
    }

    const name = payload.name?.trim();
    if (payload.name !== undefined && !name) throw badRequest("Informe o nome da igreja.");

    const email = payload.email?.trim() || null;
    if (email && !EMAIL_PATTERN.test(email)) throw badRequest("Informe um e-mail válido.");

    // Mesma validação do cadastro. null explícito limpa o campo.
    let documento: string | null = null;
    if (payload.document?.trim()) {
      const validado = validarDocumento(payload.document);
      if (!validado) throw badRequest("Informe um CNPJ ou CPF válido.", "invalid_document");
      documento = validado.formatado;
    }

    await db.transaction(async (transaction) => {
      await db.query(
        `UPDATE organizations
         SET name = COALESCE($2, name),
             document = CASE WHEN $3::boolean THEN $4 ELSE document END,
             email = CASE WHEN $5::boolean THEN $6 ELSE email END,
             phone = CASE WHEN $7::boolean THEN $8 ELSE phone END
         WHERE id = $1`,
        {
          bind: [
            organizationId(auth),
            name ?? null,
            payload.document !== undefined, documento,
            payload.email !== undefined, email,
            payload.phone !== undefined, payload.phone?.trim() || null,
          ],
          transaction,
        },
      );
      await addActivity(transaction, auth, "system", "atualizou os dados da igreja", name ?? auth.organization.name);
    });

    const rows = await db.query(
      `SELECT id, name, slug, document, email, phone, status FROM organizations WHERE id = $1`,
      { bind: [organizationId(auth)], type: QueryTypes.SELECT },
    );

    return Response.json(rows[0]);
  } catch (error) {
    return apiError(error);
  }
}
