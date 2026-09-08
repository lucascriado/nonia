// A COLEÇÃO de igrejas da pessoa logada.
//
// NÃO CONFUNDA COM /api/organization, no singular: aquele é "a igreja ATUAL
// da sessão" -- ler e editar nome, CNPJ e telefone dela. Este aqui, no plural,
// é a coleção: listar as igrejas em que a pessoa entra e criar mais uma.
// Os dois existem de propósito e são recursos diferentes; quem abrir um
// precisa saber que o outro existe.
//
// Criar uma segunda igreja é o que faz o plano Rede ser verdade: "várias
// congregações no mesmo painel" precisa de um caminho para chegar à segunda.
// Até aqui o único era ser convidada por outra pessoa.
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import {
  createSession,
  jsonWithCookie,
  requestMeta,
  requireSession,
  resolveSession,
  revokeSession,
  SESSION_COOKIE,
  sessionCookie,
} from "@/lib/auth";
import { cookies } from "next/headers";
import { sessionPayload } from "@/lib/auth-payloads";
import { validarDocumento } from "@/lib/documents";
import { badRequest, readJson } from "@/lib/http";
import { criarOrganizacaoComDono, EMAIL_PATTERN } from "@/lib/organizations";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NovaOrganizacao = {
  organizationName?: string;
  organizationSlug?: string;
  document?: string;
  email?: string;
  phone?: string;
};

export async function GET() {
  try {
    const auth = await requireSession();

    const rows = await db.query(
      `SELECT o.id, o.name, o.slug, o.timezone, r.slug AS "roleSlug", r.name AS "roleName",
              om.is_default AS "isDefault", om.joined_at AS "joinedAt"
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       JOIN roles r ON r.id = om.role_id
       WHERE om.user_id = $1 AND om.status = 'active' AND o.status = 'active'
       ORDER BY om.is_default DESC, o.name`,
      { bind: [auth.user.id], type: QueryTypes.SELECT },
    );

    return Response.json({ organizations: rows, current: auth.organization.id });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    // Só exige sessão: não há permissão a checar, porque a pessoa não está
    // agindo sobre nenhuma igreja existente -- está criando a dela.
    const auth = await requireSession();
    const payload = await readJson<NovaOrganizacao>(request);

    const name = payload.organizationName?.trim();
    if (!name) throw badRequest("Informe o nome da igreja.");

    const email = payload.email?.trim() || null;
    if (email && !EMAIL_PATTERN.test(email)) throw badRequest("Informe um e-mail válido.");

    let documento: string | null = null;
    if (payload.document?.trim()) {
      const validado = validarDocumento(payload.document);
      if (!validado) throw badRequest("Informe um CNPJ ou CPF válido.", "invalid_document");
      documento = validado.formatado;
    }

    const anterior = (await cookies()).get(SESSION_COOKIE)?.value;
    const meta = requestMeta(request);

    const session = await db.transaction(async (transaction) => {
      const organization = await criarOrganizacaoComDono(
        { name, slug: payload.organizationSlug, document: documento, email, phone: payload.phone?.trim() || null },
        auth.user.id,
        // Sem avaliação: quem já tem igreja aqui já experimentou o produto.
        // E is_default false, pela guarda do índice único: a primeira igreja
        // da pessoa continua sendo a padrão dela.
        { comAvaliacao: false, isDefault: false },
        transaction,
      );

      await addActivity(
        transaction,
        { user: auth.user, organization: { id: organization.id } },
        "system",
        "criou a organização",
        name,
      );

      // A sessão passa a ser da igreja NOVA.
      //
      // Não é conveniência: quem acabou de criar uma igreja vai configurá-la,
      // e toda ação de configuração é ESCRITA, que vai para a organização da
      // sessão. Ficando na anterior, cada cadastro entraria certinho na igreja
      // errada, sem erro nenhum -- porque o isolamento está funcionando. A
      // surpresa de trocar se resolve avisando na tela; a gravação silenciosa
      // no lugar errado não se resolve avisando.
      //
      // Sessão NOVA, como em /api/auth/switch: trocar de igreja é trocar a
      // sessão, nunca afrouxar filtro.
      return createSession(auth.user.id, organization.id, meta, transaction);
    });

    if (anterior) await revokeSession(anterior);

    const nova = await resolveSession(session.token);
    if (!nova) throw new Error("Sessão criada mas não pôde ser lida de volta.");

    return jsonWithCookie(sessionPayload(nova), sessionCookie(session.token), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
