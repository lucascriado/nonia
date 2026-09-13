import { db } from "@/lib/db";
import { addActivity } from "@/lib/activities";
import { organizationId, requirePermission } from "@/lib/auth";
import { assignMembersToCell } from "@/lib/cell-membership";
import { notFound, readJson, requireUuid } from "@/lib/http";
import { Cell, CellMember, Member } from "@/lib/models";
import { apiError } from "@/lib/records";
import { assertBelongsToOrganization } from "@/lib/tenant";

export const runtime = "nodejs";

type CellPayload = {
  name: string;
  leaderId?: string;
  address?: string;
  meetingDay?: string;
  meetingTime?: string;
  color?: string;
  notes?: string;
  memberIds?: string[];
};

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("cells.write");
    const { id } = await params;
    requireUuid(id, "Célula não encontrada.");
    const payload = await readJson<CellPayload>(request);
    const name = payload.name?.trim();
    if (!name) return Response.json({ error: "Nome da célula é obrigatório." }, { status: 400 });

    await db.transaction(async (transaction) => {
      const previous = await Cell.findOne({
        attributes: ["name"],
        where: { id, organizationId: organizationId(auth) },
        transaction,
        raw: true,
      });
      if (!previous) throw notFound("Célula não encontrada.");

      if (payload.leaderId) {
        await assertBelongsToOrganization("people", "id", payload.leaderId, organizationId(auth), transaction);
      }

      await Cell.update({
        name,
        leaderId: payload.leaderId || null,
        address: payload.address?.trim() || null,
        meetingDay: payload.meetingDay || "Domingo",
        meetingTime: payload.meetingTime || "19:30",
        color: payload.color || "purple",
        notes: payload.notes?.trim() || null,
      }, { where: { id, organizationId: organizationId(auth) }, transaction });

      await Member.update(
        { cellName: "Sem célula" },
        { where: { cellName: previous.name, organizationId: organizationId(auth) }, transaction },
      );
      await CellMember.destroy({ where: { cellId: id, organizationId: organizationId(auth) }, transaction });

      await assignMembersToCell(auth, id, name, payload.memberIds ?? [], transaction);
      await addActivity(transaction, auth, "members", "atualizou a célula", name);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("cells.write");
    const { id } = await params;
    requireUuid(id, "Célula não encontrada.");

    await db.transaction(async (transaction) => {
      const cell = await Cell.findOne({
        attributes: ["name"],
        where: { id, organizationId: organizationId(auth) },
        transaction,
        raw: true,
      });
      if (!cell) throw notFound("Célula não encontrada.");

      await Member.update(
        { cellName: "Sem célula" },
        { where: { cellName: cell.name, organizationId: organizationId(auth) }, transaction },
      );
      await Cell.destroy({ where: { id, organizationId: organizationId(auth) }, transaction });
      await addActivity(transaction, auth, "members", "excluiu a célula", cell.name);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
