import { organizationId, requirePermission } from "@/lib/auth";
import { notFound, readJson, requireUuid } from "@/lib/http";
import { buscarMembro } from "@/lib/members/queries";
import { atualizarMembro, excluirMembro } from "@/lib/members/service";
import { apiError, RecordPayload, validateRecordPayload } from "@/lib/records";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("members.read");
    const { id } = await context.params;
    requireUuid(id, "Membro não encontrado.");

    const membro = await buscarMembro(id, organizationId(auth));
    if (!membro) throw notFound("Membro não encontrado.");
    return Response.json(membro);
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("members.write");
    const { id } = await context.params;
    requireUuid(id, "Membro não encontrado.");
    const payload = await readJson<RecordPayload>(request);
    const validationError = validateRecordPayload(payload);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    await atualizarMembro(auth, id, payload);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("members.write");
    const { id } = await context.params;
    requireUuid(id, "Membro não encontrado.");

    await excluirMembro(auth, id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
