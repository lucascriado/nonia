import { createHash, randomBytes } from "node:crypto";

export const INVITATION_TTL_DAYS = 7;

export const createInvitationToken = () => randomBytes(32).toString("base64url");

export const hashInvitationToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** URL pública do convite, montada a partir do host da requisição. */
export function invitationUrl(request: Request, token: string) {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  if (configured) return `${configured}/convite/${token}`;

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "nonia.app";
  const proto = request.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/convite/${token}`;
}
