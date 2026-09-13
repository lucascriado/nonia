import { Op, col, fn, where, type WhereOptions } from "sequelize";
import { organizationId, requirePermission } from "@/lib/auth";
import { Activity } from "@/lib/models";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

const DIA = 86_400_000;

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("activities.read");
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const date = searchParams.get("date");
    const search = searchParams.get("search")?.trim();
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(10, Math.max(1, Number(searchParams.get("limit")) || 10));

    // O tenant é a primeira condição, e as outras se acrescentam a ele.
    const condicoes: WhereOptions[] = [{ organizationId: organizationId(auth) }];

    if (category && category !== "all") condicoes.push({ category });
    if (date && date !== "all") {
      // Janela corrida a partir de agora: 1, 7 ou 30 dias de 24 horas.
      const dias = date === "today" ? 1 : date === "week" ? 7 : 30;
      condicoes.push({ occurredAt: { [Op.gte]: new Date(Date.now() - dias * DIA) } });
    }
    if (search) {
      condicoes.push(where(
        fn("concat_ws", " ", col("actor"), col("action"), col("subject"), col("details")),
        { [Op.iLike]: `%${search}%` },
      ));
    }

    const filtro = { [Op.and]: condicoes };
    const total = await Activity.count({ where: filtro });
    const records = await Activity.findAll({
      attributes: ["id", "category", "actor", "action", "subject", "details", "occurredAt"],
      where: filtro,
      order: [["occurredAt", "DESC"]],
      limit,
      offset: (page - 1) * limit,
      raw: true,
    });
    return Response.json({ records, total, page, pageSize: limit });
  } catch (error) {
    return apiError(error);
  }
}
