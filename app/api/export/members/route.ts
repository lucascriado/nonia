// Exportação de membros em CSV.
//
// É LEITURA: passa por members.read, então continua funcionando quando a
// igreja está em modo somente leitura -- que é o ponto inteiro. Ninguém fica
// refém do próprio cadastro por causa de um pagamento atrasado.
import { organizationId, requirePermission } from "@/lib/auth";
import { dataBR, montarCsv, respostaCsv, texto } from "@/lib/csv";
import { filtrosDeMembros } from "@/lib/listings";
import { membrosParaExportar } from "@/lib/members/queries";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(request: Request) {
  try {
    const auth = await requirePermission("members.read");
    const { searchParams } = new URL(request.url);

    // Os MESMOS filtros da listagem, do mesmo lugar: é isto que faz
    // "exportar o que estou vendo" continuar verdade quando um dos dois mudar.
    // A exportação não pagina de propósito -- ela leva tudo o que casa.
    const filtro = filtrosDeMembros(searchParams, organizationId(auth));
    const rows = await membrosParaExportar(filtro);

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
