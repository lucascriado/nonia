import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Abre conexão e roda uma consulta mínima: com o banco fora, lança e cai
    // no 503 -- que é o que o HEALTHCHECK do container precisa ver.
    await db.authenticate();
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "unhealthy" }, { status: 503 });
  }
}
