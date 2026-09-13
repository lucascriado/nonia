import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { notFound, readJson, requireUuid } from "@/lib/http";
import { Member, Ministry } from "@/lib/models";
import { apiError } from "@/lib/records";
import { assertBelongsToOrganization, assertOwnedResource, filterOwnedMemberIds } from "@/lib/tenant";

export const runtime = "nodejs";

type MinistryPayload = {
  name: string;
  description?: string;
  color?: string;
  leaderId?: string;
  memberIds?: string[];
};

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("ministries.write");
    const { id } = await params;
    requireUuid(id, "Ministério não encontrado.");
    const payload = await readJson<MinistryPayload>(request);
    const name = payload.name?.trim();
    if (!name) return Response.json({ error: "Nome do ministério é obrigatório." }, { status: 400 });

    await db.transaction(async (transaction) => {
      await assertOwnedResource("ministries", id, organizationId(auth), "Ministério não encontrado.", transaction);
      if (payload.leaderId) {
        await assertBelongsToOrganization("people", "id", payload.leaderId, organizationId(auth), transaction);
      }

      await Ministry.update({
        name,
        color: payload.color || "purple",
        description: payload.description?.trim() || null,
        leaderId: payload.leaderId || null,
      }, { where: { id, organizationId: organizationId(auth) }, transaction });

      await Member.update(
        { ministryId: null },
        { where: { ministryId: id, organizationId: organizationId(auth) }, transaction },
      );

      const memberIds = await filterOwnedMemberIds(payload.memberIds ?? [], organizationId(auth), transaction);
      for (const memberId of memberIds) {
        await Member.update(
          { ministryId: id },
          { where: { personId: memberId, organizationId: organizationId(auth) }, transaction },
        );
      }

      await addActivity(transaction, auth, "members", "atualizou o ministério", name);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("ministries.write");
    const { id } = await params;
    requireUuid(id, "Ministério não encontrado.");

    await db.transaction(async (transaction) => {
      const ministry = await Ministry.findOne({
        attributes: ["name"],
        where: { id, organizationId: organizationId(auth) },
        transaction,
        raw: true,
      });
      if (!ministry) throw notFound("Ministério não encontrado.");

      await Member.update(
        { ministryId: null },
        { where: { ministryId: id, organizationId: organizationId(auth) }, transaction },
      );
      await Ministry.destroy({ where: { id, organizationId: organizationId(auth) }, transaction });
      await addActivity(transaction, auth, "members", "excluiu o ministério", ministry.name);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
