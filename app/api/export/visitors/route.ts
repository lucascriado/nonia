// Exportação de visitantes em CSV. Leitura: funciona em somente leitura.
import { organizationId, requirePermission } from "@/lib/auth";
import { dataBR, montarCsv, respostaCsv, texto } from "@/lib/csv";
import { filtrosDeVisitantes } from "@/lib/listings";
import { VisitorDirectory } from "@/lib/models";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ETAPA: Record<string, string> = {
  visited: "Visitou a igreja",
  contacted: "Contato realizado",
  home_visit: "Visita em casa",
  baptism: "Batismo",
  member: "Membro",
};

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("visitors.read");
    const { searchParams } = new URL(request.url);
    const filtro = filtrosDeVisitantes(searchParams, organizationId(auth), auth.organization.timezone);

    const rows = await VisitorDirectory.findAll({
      attributes: [
        "fullName", "email", "phone", "birthDate", "gender", "maritalStatus", "cpf", "zipCode",
        "address", "neighborhood", "city", "state", "visitDate", "invitedBy", "membershipStage", "notes",
      ],
      where: filtro,
      order: [["visitDate", "DESC"], ["fullName", "ASC"]],
      raw: true,
    });

    const csv = montarCsv(
      ["Nome", "E-mail", "Telefone", "Data de nascimento", "Sexo", "Estado civil", "CPF", "CEP",
       "Endereço", "Bairro", "Cidade", "Estado", "Data da visita", "Convidado por", "Etapa", "Observações"],
      rows.map((r) => [
        texto(r.fullName), texto(r.email), texto(r.phone), texto(dataBR(r.birthDate)),
        texto(r.gender), texto(r.maritalStatus), texto(r.cpf), texto(r.zipCode),
        texto(r.address), texto(r.neighborhood), texto(r.city), texto(r.state),
        texto(dataBR(r.visitDate)), texto(r.invitedBy),
        texto(ETAPA[r.membershipStage ?? ""] ?? r.membershipStage), texto(r.notes),
      ]),
    );

    return respostaCsv(csv, "visitantes", auth.organization.slug);
  } catch (error) {
    return apiError(error);
  }
}
