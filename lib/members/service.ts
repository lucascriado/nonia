import type { Transaction } from "sequelize";
import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { type AuthContext, organizationId } from "@/lib/auth";
import { syncCellMembership } from "@/lib/cell-membership";
import { hojeNoFuso } from "@/lib/datas";
import { Member, Ministry, Person, Visitor } from "@/lib/models";
import { assertWithinPlanLimit } from "@/lib/plan-limits";
import { nullable, personAttributes, RecordPayload } from "@/lib/records";
import { assertAffected } from "@/lib/tenant";

// Regras de ESCRITA de membros.
//
// Cada função abre a própria transação e registra a atividade DENTRO dela: a
// atividade gravada numa segunda transação já deixou o chamador recebendo 500
// sobre uma escrita que tinha funcionado.
//
// O payload chega JÁ VALIDADO (`validateRecordPayload`) -- validar é da rota,
// porque é ela que sabe responder 400. Recusas daqui (teto do plano, registro
// de outra igreja) saem como exceção e a rota as traduz com `apiError`.

/**
 * Ministério é resolvido pelo NOME, dentro da organização.
 *
 * Só texto: um array aqui viraria `name IN (...)` e casaria um dos ministérios,
 * onde o SQL antigo não casava nenhum.
 */
async function resolverMinisterio(auth: AuthContext, nome: unknown, transaction: Transaction) {
  if (typeof nome !== "string" || !nome || nome === "Nenhum") return null;
  return Ministry.findOne({
    where: { name: nome, organizationId: organizationId(auth) },
    transaction,
  });
}

export async function criarMembro(auth: AuthContext, payload: RecordPayload) {
  return db.transaction(async (transaction) => {
    await assertWithinPlanLimit(auth, "members", transaction);

    const person = await Person.create(
      { ...personAttributes(payload), organizationId: organizationId(auth) },
      { transaction },
    );
    const ministry = await resolverMinisterio(auth, payload.ministry, transaction);

    await Member.create({
      personId: person.id,
      organizationId: organizationId(auth),
      ministryId: ministry?.id ?? null,
      role: payload.role || "Membro Comum",
      status: payload.status === "Inativo" ? "inactive" : "active",
      baptismStatus: payload.baptismDate ? "baptized" : "waiting",
      baptismDate: nullable(payload.baptismDate),
      // No fuso da igreja, e não pelo DEFAULT CURRENT_DATE do banco, que rodava
      // em UTC: das 21h à meia-noite em Brasília o membro nascia admitido
      // AMANHÃ, e no dia 30 ou 31 caía no MÊS seguinte -- somindo do indicador
      // "novos este mês" de `resumoDeMembros`. Ver lib/datas.ts; o default do
      // banco saiu na migration 023.
      admissionDate: hojeNoFuso(auth.organization.timezone),
      cellName: payload.cell || "Sem célula",
    }, { transaction });
    await syncCellMembership(auth, person.id, payload.cell, transaction);
    await addActivity(transaction, auth, "members", "cadastrou um novo membro", payload.name);
    return person.id;
  });
}

export async function atualizarMembro(auth: AuthContext, id: string, payload: RecordPayload) {
  await db.transaction(async (transaction) => {
    const ministry = await resolverMinisterio(auth, payload.ministry, transaction);

    // O organization_id no WHERE é o que impede editar o membro de outra igreja.
    const [affected] = await Person.update(personAttributes(payload), {
      where: { id, organizationId: organizationId(auth) },
      transaction,
    });
    assertAffected(affected, "Membro não encontrado.");

    // A célula tem a mesma rede da foto e do comprovante: chave AUSENTE
    // preserva, só string vazia explícita desvincula.
    //
    // Isso passou a importar quando a tela de células saiu da interface: um
    // formulário de membro sem o campo de célula mandaria `cell` indefinido,
    // e sem esta guarda cada edição de membro -- "só mudei o telefone" --
    // devolveria a pessoa para "Sem célula" e apagaria o vínculo em
    // cell_members. Perda silenciosa, num caminho que ninguém testa.
    const mexeuNaCelula = payload.cell !== undefined;

    await Member.update({
      ministryId: ministry?.id ?? null,
      role: payload.role || "Membro Comum",
      status: payload.status === "Inativo" ? "inactive" : "active",
      baptismStatus: payload.baptismDate ? "baptized" : "waiting",
      baptismDate: nullable(payload.baptismDate),
      ...(mexeuNaCelula ? { cellName: payload.cell || "Sem célula" } : {}),
    }, { where: { personId: id, organizationId: organizationId(auth) }, transaction });

    if (mexeuNaCelula) await syncCellMembership(auth, id, payload.cell, transaction);
    await addActivity(transaction, auth, "members", "atualizou o cadastro de", payload.name);
  });
}

export async function excluirMembro(auth: AuthContext, id: string) {
  await db.transaction(async (transaction) => {
    const person = await Person.findOne({
      where: { id, organizationId: organizationId(auth) },
      transaction,
    });
    if (!person) assertAffected(0, "Membro não encontrado.");

    const affected = await Member.destroy({
      where: { personId: id, organizationId: organizationId(auth) },
      transaction,
    });
    assertAffected(affected, "Membro não encontrado.");

    // A pessoa só some quando não é mais visitante também.
    const stillVisitor = await Visitor.count({
      where: { personId: id, organizationId: organizationId(auth) },
      transaction,
    });
    if (stillVisitor === 0) {
      await Person.destroy({ where: { id, organizationId: organizationId(auth) }, transaction });
    }

    await addActivity(transaction, auth, "members", "excluiu o cadastro de", person?.fullName);
  });
}
