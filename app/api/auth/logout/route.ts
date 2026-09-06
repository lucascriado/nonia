// Encerra a sessão atual. Idempotente: sempre responde 200 e limpa o cookie.
import { cookies } from "next/headers";
import { clearedSessionCookie, jsonWithCookie, revokeSession, SESSION_COOKIE } from "@/lib/auth";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";

export async function POST() {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) await revokeSession(token);
    return jsonWithCookie({ ok: true }, clearedSessionCookie());
  } catch (error) {
    return apiError(error);
  }
}
