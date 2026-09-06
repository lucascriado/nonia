// Filtros e paginação das listagens.
//
// Fonte ÚNICA dos filtros: a listagem e a exportação montam o WHERE a partir
// daqui. Antes cada uma tinha o seu, e "exportar o que estou vendo" só era
// verdade enquanto ninguém mexesse em um dos dois lados. Com um lugar só, não
// há como divergirem.
//
// Os nomes dos parâmetros são os mesmos do estado das telas, e as listas
// aceitam tanto o rótulo em português ("Ativo") quanto o valor do banco
// ("active") -- assim o frontend manda o que já tem, sem tabela de tradução.

export type Filtro = { where: string[]; valores: unknown[] };

export type Pagina = { page: number; pageSize: number; offset: number };

const PAGE_SIZE_PADRAO = 25;
const PAGE_SIZE_MAX = 100;

export function paginacao(params: URLSearchParams): Pagina {
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pedido = Number(params.get("pageSize")) || PAGE_SIZE_PADRAO;
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, pedido));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

const normalizar = (valor: string | null, mapa: Record<string, string>) => {
  if (!valor || valor === "all") return null;
  const chave = valor.trim();
  return mapa[chave] ?? mapa[chave.toLowerCase()] ?? chave;
};

/** Acrescenta uma condição com o próximo $n, se o valor existir. */
function condicao(f: Filtro, valor: unknown, molde: (n: number) => string) {
  if (valor === null || valor === undefined || valor === "") return;
  f.valores.push(valor);
  f.where.push(molde(f.valores.length));
}

const STATUS_MEMBRO = { Ativo: "active", Inativo: "inactive", active: "active", inactive: "inactive" };
const BATISMO = { Batizado: "baptized", Aguardando: "waiting", baptized: "baptized", waiting: "waiting" };
const TIPO = { Entrada: "income", "Saída": "expense", income: "income", expense: "expense" };
const STATUS_LANC = { Pago: "paid", Pendente: "pending", paid: "paid", pending: "pending" };

export function filtrosDeMembros(params: URLSearchParams, organizationId: string): Filtro {
  const f: Filtro = { where: ["organization_id = $1"], valores: [organizationId] };
  const busca = params.get("search")?.trim();
  condicao(f, busca ? `%${busca}%` : null, (n) => `concat_ws(' ', full_name, email, cell_name) ILIKE $${n}`);
  const ministerio = params.get("ministry");
  condicao(f, ministerio && ministerio !== "all" ? ministerio : null, (n) => `ministry = $${n}`);
  condicao(f, normalizar(params.get("status"), STATUS_MEMBRO), (n) => `status = $${n}`);
  condicao(f, normalizar(params.get("baptism"), BATISMO), (n) => `baptism_status = $${n}`);
  return f;
}

export function filtrosDeVisitantes(params: URLSearchParams, organizationId: string): Filtro {
  const f: Filtro = { where: ["organization_id = $1"], valores: [organizationId] };
  const busca = params.get("search")?.trim();
  condicao(f, busca ? `%${busca}%` : null, (n) => `concat_ws(' ', full_name, email, invited_by) ILIKE $${n}`);
  // As abas da tela: "Recentes" é a marca is_recent, e qualquer outra que não
  // seja "Todos" é a primeira visita.
  const aba = params.get("tab");
  if (aba === "Recentes") f.where.push("is_recent");
  else if (aba && aba !== "Todos" && aba !== "all") f.where.push("membership_stage = 'visited'");
  const convidou = params.get("invitedBy");
  condicao(f, convidou && convidou !== "all" ? convidou : null, (n) => `invited_by = $${n}`);
  return f;
}

export function filtrosDeFinanceiro(
  params: URLSearchParams,
  organizationId: string,
  opcoes: { incluirLixeira?: boolean } = {},
): Filtro {
  const f: Filtro = { where: ["organization_id = $1"], valores: [organizationId] };

  // Excluído nunca aparece por acidente: quem quer a lixeira pede por ela.
  f.where.push(opcoes.incluirLixeira ? "deleted_at IS NOT NULL" : "deleted_at IS NULL");

  const busca = params.get("search")?.trim();
  condicao(f, busca ? `%${busca}%` : null, (n) => `concat_ws(' ', description, counterparty) ILIKE $${n}`);
  condicao(f, normalizar(params.get("type"), TIPO), (n) => `type = $${n}`);
  condicao(f, normalizar(params.get("status"), STATUS_LANC), (n) => `status = $${n}`);
  const categoria = params.get("category");
  condicao(f, categoria && categoria !== "all" ? categoria : null, (n) => `category = $${n}`);
  const anexo = params.get("attachment");
  if (anexo === "with") f.where.push("attachment_url IS NOT NULL");
  else if (anexo === "without") f.where.push("attachment_url IS NULL");
  return f;
}
