import { Op, col, fn, where, type WhereOptions } from "sequelize";
import { hojeNoFuso, somarDias } from "@/lib/datas";

// Filtros e paginação das listagens.
//
// Fonte ÚNICA dos filtros: a listagem e a exportação montam o `where` a partir
// daqui. Antes cada uma tinha o seu, e "exportar o que estou vendo" só era
// verdade enquanto ninguém mexesse em um dos dois lados. Com um lugar só, não
// há como divergirem.
//
// Os nomes dos parâmetros são os mesmos do estado das telas, e as listas
// aceitam tanto o rótulo em português ("Ativo") quanto o valor do banco
// ("active") -- assim o frontend manda o que já tem, sem tabela de tradução.
//
// O filtro é um `where` do Sequelize, e a PRIMEIRA condição é sempre o tenant.
// Quem acrescenta condição faz `{ [Op.and]: [filtro, { ... }] }` -- nunca
// substitui o objeto, ou o tenant vai junto.

export type Filtro = WhereOptions;

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

/** Valor de um seletor da tela, ou null quando é "todos". */
const escolhido = (valor: string | null) => (valor && valor !== "all" ? valor : null);

/** Busca livre: as colunas concatenadas, sem diferenciar maiúscula. */
const busca = (params: URLSearchParams, ...colunas: string[]) => {
  const termo = params.get("search")?.trim();
  if (!termo) return null;
  return where(fn("concat_ws", " ", ...colunas.map((c) => col(c))), { [Op.iLike]: `%${termo}%` });
};

/** Junta as condições presentes, com o tenant na frente. */
const juntar = (organizationId: string, ...condicoes: (WhereOptions | null)[]): Filtro => ({
  [Op.and]: [{ organizationId }, ...condicoes.filter((c): c is WhereOptions => c !== null)],
});

const STATUS_MEMBRO = { Ativo: "active", Inativo: "inactive", active: "active", inactive: "inactive" };
const BATISMO = { Batizado: "baptized", Aguardando: "waiting", baptized: "baptized", waiting: "waiting" };
const TIPO = { Entrada: "income", "Saída": "expense", income: "income", expense: "expense" };
const STATUS_LANC = { Pago: "paid", Pendente: "pending", paid: "paid", pending: "pending" };

/** Sobre `MemberDirectory`. */
export function filtrosDeMembros(params: URLSearchParams, organizationId: string): Filtro {
  const ministerio = escolhido(params.get("ministry"));
  const status = normalizar(params.get("status"), STATUS_MEMBRO);
  const batismo = normalizar(params.get("baptism"), BATISMO);
  return juntar(
    organizationId,
    busca(params, "full_name", "email", "cell_name"),
    ministerio ? { ministry: ministerio } : null,
    status ? { status } : null,
    batismo ? { baptismStatus: batismo } : null,
  );
}

/**
 * A janela da aba "Recentes", em dias.
 *
 * Duas semanas, que é a fronteira que o próprio dado de demonstração já
 * usava: a semente marcou como recente até 13 dias e como não recente a
 * partir de 20. São também dois domingos — quem visitou teve duas
 * oportunidades de voltar antes de sair da aba.
 *
 * Não é o mês corrente: no dia 1º a aba zeraria, e uma igreja que recebeu 20
 * visitantes no dia 31 abriria a tela sem nenhum. Trocaria um número errado
 * por outro, só que com data marcada.
 */
export const DIAS_VISITA_RECENTE = 14;

/** Sobre `VisitorDirectory`. */
export function filtrosDeVisitantes(params: URLSearchParams, organizationId: string, fuso: string | null | undefined): Filtro {
  // As abas da tela: "Recentes" é a data da visita, e qualquer outra que não
  // seja "Todos" é a primeira visita.
  //
  // A aba NÃO usa a marca `is_recent`, ainda que a coluna exista e o nome
  // convide: ela nasce true e nada nunca a limpa, então todo visitante
  // cadastrado pelo app seria "recente" para sempre e a aba viraria uma
  // segunda "Todos" com o uso. Mesma doença do `is_new` nos indicadores.
  //
  // A JANELA É CONTADA A PARTIR DE HOJE NA IGREJA. Era CURRENT_DATE, que segue
  // o fuso da SESSÃO do Postgres (UTC nos nossos bancos): das 21h à meia-noite
  // em Brasília a janela já tinha virado o dia, e um visitante de exatamente
  // 14 dias atrás saía da aba cedo demais.
  const aba = params.get("tab");
  let porAba: WhereOptions | null = null;
  if (aba === "Recentes") {
    porAba = { visitDate: { [Op.gte]: somarDias(hojeNoFuso(fuso), -DIAS_VISITA_RECENTE) } };
  } else if (aba && aba !== "Todos" && aba !== "all") {
    porAba = { membershipStage: "visited" };
  }
  const convidou = escolhido(params.get("invitedBy"));
  return juntar(
    organizationId,
    busca(params, "full_name", "email", "invited_by"),
    porAba,
    convidou ? { invitedBy: convidou } : null,
  );
}

/** Sobre `FinancialTransaction`. */
export function filtrosDeFinanceiro(
  params: URLSearchParams,
  organizationId: string,
  opcoes: { incluirLixeira?: boolean } = {},
): Filtro {
  const tipo = normalizar(params.get("type"), TIPO);
  const status = normalizar(params.get("status"), STATUS_LANC);
  const categoria = escolhido(params.get("category"));
  const anexo = params.get("attachment");
  return juntar(
    organizationId,
    // Excluído nunca aparece por acidente: quem quer a lixeira pede por ela.
    { deletedAt: opcoes.incluirLixeira ? { [Op.ne]: null } : null },
    busca(params, "description", "counterparty"),
    tipo ? { type: tipo } : null,
    status ? { status } : null,
    categoria ? { category: categoria } : null,
    anexo === "with" ? { attachmentUrl: { [Op.ne]: null } }
      : anexo === "without" ? { attachmentUrl: null }
      : null,
  );
}
