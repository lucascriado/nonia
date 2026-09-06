import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { notFound, requireUuid } from "@/lib/http";
import { Member, Person, Visitor } from "@/lib/models";
import { assertWithinPlanLimit } from "@/lib/plan-limits";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("members.write");
    const { id } = await context.params;
    requireUuid(id, "Pessoa não encontrada.");

    await db.transaction(async (transaction) => {
      const person = await Person.findOne({
        where: { id, organizationId: organizationId(auth) },
        transaction,
      });
      if (!person) throw notFound("Pessoa não encontrada.");

      const existingMember = await Member.findOne({
        where: { personId: id, organizationId: organizationId(auth) },
        transaction,
      });

      if (!existingMember) {
        // A conversão é o outro caminho que aumenta a contagem de membros.
        // Reconverter quem já é membro não cria nada, então não é verificado.
        await assertWithinPlanLimit(auth, "members", transaction);

        await Member.create({
          personId: id,
          organizationId: organizationId(auth),
          ministryId: null,
          role: "Membro Comum",
          status: "active",
          baptismStatus: "waiting",
          baptismDate: null,
        }, { transaction });
      }

      await Visitor.destroy({
        where: { personId: id, organizationId: organizationId(auth) },
        transaction,
      });
      await addActivity(transaction, auth, "members", "converteu visitante em membro", person.fullName);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
