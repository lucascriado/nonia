import type { ModelStatic, Transaction, WhereOptions } from "sequelize";
import { badRequest, notFound } from "@/lib/http";
import { Cell, Member, Ministry, Person } from "@/lib/models";

type Scoped = "people" | "ministries" | "cells" | "members";

/** O Model de cada tabela aceita aqui. Lista fechada: nenhum nome de tabela vem de fora. */
const MODELOS: Record<Scoped, ModelStatic<Person | Ministry | Cell | Member>> = {
  people: Person,
  ministries: Ministry,
  cells: Cell,
  members: Member,
};

/** Coluna do banco -> atributo do Model. */
const ATRIBUTO = { id: "id", person_id: "personId" } as const;

/**
 * O valor tem que ser um id escalar antes de virar `where`.
 *
 * O id vem de payload, e o TypeScript não vale em runtime. No `where` do
 * Sequelize um ARRAY vira `IN (...)` -- e `[idDaIgreja, idDeOutra]` passaria
 * na conferência por causa do primeiro. Com SQL cru e parâmetro, qualquer
 * não-texto estourava no banco (500); continua estourando, só que antes.
 * Nulo nunca casou com linha nenhuma (`= NULL`), e continua não casando.
 */
function idEscalar(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Id inválido para conferência de organização: ${typeof value}.`);
  return value;
}

/**
 * Existe uma linha com `atributo = value` NESTA organização?
 *
 * O tenant entra sempre, junto com o id: é ele que torna um id de outra igreja
 * indistinguível de um id inexistente.
 */
async function existeNaOrganizacao(
  table: Scoped,
  atributo: "id" | "personId",
  value: string,
  organizationId: string,
  transaction?: Transaction,
) {
  const id = idEscalar(value);
  if (id === null) return false;
  const where = { [atributo]: id, organizationId } as WhereOptions;
  const linha = await MODELOS[table].findOne({ attributes: [atributo], where, transaction, raw: true });
  return linha !== null;
}

/**
 * Confere que um id informado no payload pertence à organização da sessão.
 * Sem isso, um `ministryId` de outra igreja entraria por um campo de
 * formulário -- o banco só barra as referências que têm FK composta.
 */
export async function assertBelongsToOrganization(
  table: Scoped,
  column: "id" | "person_id",
  value: string,
  organizationId: string,
  transaction?: Transaction,
) {
  // Acontece quando a tela mandou um id que não é desta igreja -- em geral
  // porque a lista estava velha. A mensagem diz o que fazer, não só o que
  // deu errado.
  if (!(await existeNaOrganizacao(table, ATRIBUTO[column], value, organizationId, transaction))) {
    throw badRequest(
      "O registro selecionado não pertence a esta igreja. Atualize a página e escolha de novo.",
      "cross_tenant",
    );
  }
}

/** Filtra ids mantendo só os que são da organização. */
export async function filterOwnedMemberIds(
  ids: string[],
  organizationId: string,
  transaction?: Transaction,
): Promise<string[]> {
  if (!ids.length) return [];
  const validos = ids.map(idEscalar).filter((id): id is string => id !== null);
  if (!validos.length) return [];
  const rows = await Member.findAll({
    attributes: ["personId"],
    where: { organizationId, personId: validos },
    transaction,
    raw: true,
  });
  return rows.map((row) => row.personId);
}

/**
 * Filtra ids de PESSOA mantendo só os que são da organização.
 *
 * Irmã de `filterOwnedMemberIds`, e a diferença importa: aquela consulta
 * `members`, ou seja só quem TEM ficha de membro. Esta consulta `people`, que é
 * quem a pessoa é. Usada pelos responsáveis do evento, que apontam para
 * `people` justamente para não sumirem do histórico quando alguém deixa de ser
 * membro -- filtrar por `members` ali reintroduziria, na validação, a
 * dependência que a modelagem tirou.
 */
export async function filterOwnedPersonIds(
  ids: string[],
  organizationId: string,
  transaction?: Transaction,
): Promise<string[]> {
  if (!ids.length) return [];
  const validos = ids.map(idEscalar).filter((id): id is string => id !== null);
  if (!validos.length) return [];
  const rows = await Person.findAll({
    attributes: ["id"],
    where: { organizationId, id: validos },
    transaction,
    raw: true,
  });
  return rows.map((row) => row.id);
}

/** Traduz "0 linhas afetadas" em 404, para não confundir com sucesso. */
export function assertAffected(affected: number, message = "Registro não encontrado.") {
  if (!affected) throw notFound(message);
}

/**
 * Igual à anterior, mas para o recurso identificado na própria URL: responde
 * 404, e não 400, para que um id de outra organização seja indistinguível de
 * um id inexistente.
 */
export async function assertOwnedResource(
  table: Scoped,
  value: string,
  organizationId: string,
  message: string,
  transaction?: Transaction,
) {
  if (!(await existeNaOrganizacao(table, "id", value, organizationId, transaction))) throw notFound(message);
}
