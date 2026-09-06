// Exportação de visitantes em CSV. Leitura: funciona em somente leitura.
import { query } from "@/lib/db";
import { organizationId, requirePermission } from "@/lib/auth";
import { dataBR, montarCsv, respostaCsv, texto } from "@/lib/csv";
import { filtrosDeVisitantes } from "@/lib/listings";
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
    const filtro = filtrosDeVisitantes(searchParams, organizationId(auth));

    const { rows } = await query<Record<string, string | null>>(
      `SELECT full_name, email, phone, birth_date, gender, marital_status, cpf, zip_code,
              address, neighborhood, city, state, visit_date, invited_by, membership_stage, notes
       FROM visitor_directory
       WHERE ${filtro.where.join(" AND ")}
       ORDER BY visit_date DESC, full_name`,
      filtro.valores,
    );

    const csv = montarCsv(
      ["Nome", "E-mail", "Telefone", "Data de nascimento", "Sexo", "Estado civil", "CPF", "CEP",
       "Endereço", "Bairro", "Cidade", "Estado", "Data da visita", "Convidado por", "Etapa", "Observações"],
      rows.map((r) => [
        texto(r.full_name), texto(r.email), texto(r.phone), texto(dataBR(r.birth_date)),
        texto(r.gender), texto(r.marital_status), texto(r.cpf), texto(r.zip_code),
        texto(r.address), texto(r.neighborhood), texto(r.city), texto(r.state),
        texto(dataBR(r.visit_date)), texto(r.invited_by),
        texto(ETAPA[r.membership_stage ?? ""] ?? r.membership_stage), texto(r.notes),
      ]),
    );

    return respostaCsv(csv, "visitantes", auth.organization.slug);
  } catch (error) {
    return apiError(error);
  }
}
