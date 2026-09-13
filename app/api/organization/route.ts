// Dados cadastrais da igreja ATUAL da sessão.
//
// NÃO CONFUNDA COM /api/organizations, no plural: aquele é a COLEÇÃO -- as
// igrejas em que a pessoa entra, e a criação de mais uma. Este aqui é sempre
// a igreja da sessão, uma só. Os dois existem de propósito e são recursos
// diferentes; quem abrir um precisa saber que o outro existe.
//
// Usa as permissões organization.read e organization.write, que existiam no
// banco desde a 004 sem nenhuma rota consultando -- permissão declarada e
// nunca usada é pior do que não existir, porque aparece no seletor de papéis
// prometendo um poder que não existe.
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { badRequest, readJson } from "@/lib/http";
import { validarDocumento } from "@/lib/documents";
import { Organization } from "@/lib/models";
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

    const organization = await Organization.findOne({
      attributes: ["id", "name", "slug", "document", "email", "phone", "status", ["created_at", "createdAt"]],
      where: { id: organizationId(auth) },
      raw: true,
    });

    return Response.json(organization);
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
      // Só entra no UPDATE o campo que veio no payload; ausente mantém o valor.
      const valores: { name?: string; document?: string | null; email?: string | null; phone?: string | null } = {};
      if (name != null) valores.name = name;
      if (payload.document !== undefined) valores.document = documento;
      if (payload.email !== undefined) valores.email = email;
      if (payload.phone !== undefined) valores.phone = payload.phone?.trim() || null;

      await Organization.update(valores, { where: { id: organizationId(auth) }, transaction });
      await addActivity(transaction, auth, "system", "atualizou os dados da igreja", name ?? auth.organization.name);
    });

    const atualizada = await Organization.findOne({
      attributes: ["id", "name", "slug", "document", "email", "phone", "status"],
      where: { id: organizationId(auth) },
      raw: true,
    });

    return Response.json(atualizada);
  } catch (error) {
    return apiError(error);
  }
}
