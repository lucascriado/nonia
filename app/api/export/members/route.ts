// Exportação de membros em CSV.
//
// É LEITURA: passa por members.read, então continua funcionando quando a
// igreja está em modo somente leitura -- que é o ponto inteiro. Ninguém fica
// refém do próprio cadastro por causa de um pagamento atrasado.
import { query } from "@/lib/db";
import { organizationId, requirePermission } from "@/lib/auth";
import { dataBR, montarCsv, normalizar, respostaCsv, texto } from "@/lib/csv";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS = { Ativo: "active", Inativo: "inactive", active: "active", inactive: "inactive" };
const BATISMO = { Batizado: "baptized", Aguardando: "waiting", baptized: "baptized", waiting: "waiting" };

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("members.read");
    const { searchParams } = new URL(request.url);

    // Mesmos nomes e mesma semântica dos filtros da tela, para "exportar o que
    // estou vendo" ser verdade e não quase verdade.
    const busca = searchParams.get("search")?.trim() || null;
    const ministerio = searchParams.get("ministry");
    const status = normalizar(searchParams.get("status"), STATUS);
    const batismo = normalizar(searchParams.get("baptism"), BATISMO);

    const valores: unknown[] = [organizationId(auth)];
    const filtros = ["organization_id = $1"];
    if (busca) {
      valores.push(`%${busca}%`);
      filtros.push(`concat_ws(' ', full_name, email, cell_name) ILIKE $${valores.length}`);
    }
    if (ministerio && ministerio !== "all") {
      valores.push(ministerio);
      filtros.push(`ministry = $${valores.length}`);
    }
    if (status) {
      valores.push(status);
      filtros.push(`status = $${valores.length}`);
    }
    if (batismo) {
      valores.push(batismo);
      filtros.push(`baptism_status = $${valores.length}`);
    }

    const { rows } = await query<Record<string, string | null>>(
      `SELECT full_name, email, phone, birth_date, gender, marital_status, cpf, zip_code,
              address, neighborhood, city, state, ministry, cell_name, role, status,
              baptism_status, baptism_date, admission_date, notes
       FROM member_directory
       WHERE ${filtros.join(" AND ")}
       ORDER BY full_name`,
      valores,
    );

    const csv = montarCsv(
      ["Nome", "E-mail", "Telefone", "Data de nascimento", "Sexo", "Estado civil", "CPF", "CEP",
       "Endereço", "Bairro", "Cidade", "Estado", "Ministério", "Célula", "Função", "Status",
       "Batismo", "Data de batismo", "Data de admissão", "Observações"],
      rows.map((r) => [
        texto(r.full_name), texto(r.email), texto(r.phone), texto(dataBR(r.birth_date)),
        texto(r.gender), texto(r.marital_status), texto(r.cpf), texto(r.zip_code),
        texto(r.address), texto(r.neighborhood), texto(r.city), texto(r.state),
        texto(r.ministry), texto(r.cell_name), texto(r.role),
        texto(r.status === "active" ? "Ativo" : "Inativo"),
        texto(r.baptism_status === "baptized" ? "Batizado" : "Aguardando"),
        texto(dataBR(r.baptism_date)), texto(dataBR(r.admission_date)), texto(r.notes),
      ]),
    );

    return respostaCsv(csv, "membros", auth.organization.slug);
  } catch (error) {
    return apiError(error);
  }
}
