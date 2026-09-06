// Sessão própria do Nonia: token opaco no cookie httpOnly, estado no banco.
//
// O cookie carrega só um token aleatório de 256 bits; o banco guarda o
// SHA-256 dele. Um vazamento da tabela `sessions` não permite montar um
// cookie válido, e a validação continua sendo uma busca por índice único.

import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { QueryTypes, type Transaction } from "sequelize";
import { db } from "@/lib/db";
import { forbidden, unauthorized } from "@/lib/http";

export const SESSION_COOKIE = "nonia_session";
export const SESSION_TTL_DAYS = 30;

const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
// Só renova a validade quando falta menos que isso, para não escrever no
// banco a cada requisição.
const SESSION_RENEW_THRESHOLD_MS = SESSION_TTL_MS / 2;
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export type Role = { slug: string; name: string; level: number };

export type AuthContext = {
  sessionId: string;
  expiresAt: Date;
  user: { id: string; email: string; fullName: string; avatarUrl: string | null };
  organization: { id: string; name: string; slug: string; status: string };
  role: Role;
  personId: string | null;
  permissions: Set<string>;
};

// Atalho: quase toda query precisa só do tenant.
export const organizationId = (auth: AuthContext) => auth.organization.id;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const createSessionToken = () => randomBytes(32).toString("base64url");

// ---------------------------------------------------------------------------
// Cookie
//
// O Set-Cookie é montado à mão e devolvido no header da resposta em vez de
// usar `cookies().set()`: funciona igual em qualquer runtime e deixa a rota
// explícita sobre quando o cookie muda.
// ---------------------------------------------------------------------------
function serializeCookie(value: string, maxAgeSeconds: number) {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export const sessionCookie = (token: string) =>
  serializeCookie(token, Math.floor(SESSION_TTL_MS / 1000));

export const clearedSessionCookie = () => serializeCookie("", 0);

/** Resposta JSON que também grava (ou limpa) o cookie de sessão. */
export function jsonWithCookie(body: unknown, cookie: string, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.append("Set-Cookie", cookie);
  return Response.json(body, { ...init, headers });
}

// ---------------------------------------------------------------------------
// Ciclo de vida da sessão
// ---------------------------------------------------------------------------
export async function createSession(
  userId: string,
  organizationIdValue: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
  transaction?: Transaction,
): Promise<{ token: string; expiresAt: Date }> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.query(
    `INSERT INTO sessions (user_id, organization_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    {
      bind: [
        userId,
        organizationIdValue,
        hashToken(token),
        meta.ipAddress || null,
        meta.userAgent?.slice(0, 400) || null,
        expiresAt,
      ],
      transaction,
    },
  );

  return { token, expiresAt };
}

export async function revokeSession(token: string) {
  await db.query(`UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, {
    bind: [hashToken(token)],
  });
}

export async function revokeAllUserSessions(userId: string, transaction?: Transaction) {
  await db.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, {
    bind: [userId],
    transaction,
  });
}

/** Remove sessões expiradas ou revogadas há mais de 30 dias. */
export async function purgeStaleSessions() {
  await db.query(
    `DELETE FROM sessions
     WHERE expires_at < now() - interval '30 days'
        OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days')`,
  );
}

type SessionRow = {
  sessionId: string;
  expiresAt: Date;
  lastSeenAt: Date;
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  userStatus: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationStatus: string;
  membershipStatus: string;
  personId: string | null;
  roleSlug: string;
  roleName: string;
  roleLevel: number;
  permissions: string[];
};

const SESSION_QUERY = `
  SELECT
    s.id AS "sessionId",
    s.expires_at AS "expiresAt",
    s.last_seen_at AS "lastSeenAt",
    u.id AS "userId",
    u.email,
    u.full_name AS "fullName",
    u.avatar_url AS "avatarUrl",
    u.status AS "userStatus",
    o.id AS "organizationId",
    o.name AS "organizationName",
    o.slug AS "organizationSlug",
    o.status AS "organizationStatus",
    om.status AS "membershipStatus",
    om.person_id AS "personId",
    r.slug AS "roleSlug",
    r.name AS "roleName",
    r.level AS "roleLevel",
    COALESCE(
      array_agg(rp.permission_slug) FILTER (WHERE rp.permission_slug IS NOT NULL),
      ARRAY[]::varchar[]
    ) AS permissions
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  JOIN organizations o ON o.id = s.organization_id
  JOIN organization_members om
    ON om.organization_id = s.organization_id AND om.user_id = s.user_id
  JOIN roles r ON r.id = om.role_id
  LEFT JOIN role_permissions rp ON rp.role_id = r.id
  WHERE s.token_hash = $1
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
  GROUP BY s.id, u.id, o.id, om.organization_id, om.user_id, r.id
`;

async function loadContext(token: string): Promise<AuthContext | null> {
  const rows = await db.query<SessionRow>(SESSION_QUERY, {
    bind: [hashToken(token)],
    type: QueryTypes.SELECT,
  });

  const row = rows[0];
  if (!row) return null;
  if (row.userStatus !== "active" || row.membershipStatus !== "active") return null;

  if (row.organizationStatus !== "active") {
    throw forbidden(
      "A assinatura desta organização está suspensa. Fale com o responsável pela conta.",
      "organization_suspended",
    );
  }

  const now = Date.now();
  const expiresAt = new Date(row.expiresAt);
  const shouldRenew = expiresAt.getTime() - now < SESSION_RENEW_THRESHOLD_MS;
  const shouldTouch = now - new Date(row.lastSeenAt).getTime() > LAST_SEEN_THROTTLE_MS;

  if (shouldRenew || shouldTouch) {
    const nextExpiry = shouldRenew ? new Date(now + SESSION_TTL_MS) : expiresAt;
    await db.query(`UPDATE sessions SET last_seen_at = now(), expires_at = $2 WHERE id = $1`, {
      bind: [row.sessionId, nextExpiry],
    });
  }

  return {
    sessionId: row.sessionId,
    expiresAt,
    user: { id: row.userId, email: row.email, fullName: row.fullName, avatarUrl: row.avatarUrl },
    organization: {
      id: row.organizationId,
      name: row.organizationName,
      slug: row.organizationSlug,
      status: row.organizationStatus,
    },
    role: { slug: row.roleSlug, name: row.roleName, level: row.roleLevel },
    personId: row.personId,
    permissions: new Set(row.permissions),
  };
}

/**
 * Resolve o contexto a partir do token cru. Usado pelo login e pelo cadastro,
 * que precisam montar a resposta antes de o cookie existir na requisição.
 */
export const resolveSession = (token: string) => loadContext(token);

/** Lê o cookie e resolve a sessão. Memoizado por requisição. */
export const getSession = cache(async (): Promise<AuthContext | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return loadContext(token);
});

/** Igual a getSession, mas lança 401 quando não há sessão válida. */
export async function requireSession(): Promise<AuthContext> {
  const auth = await getSession();
  if (!auth) throw unauthorized();
  return auth;
}

// ---------------------------------------------------------------------------
// Autorização
// ---------------------------------------------------------------------------
export function can(auth: AuthContext, ...permissions: string[]): boolean {
  return permissions.every((permission) => auth.permissions.has(permission));
}

export function canAny(auth: AuthContext, ...permissions: string[]): boolean {
  return permissions.some((permission) => auth.permissions.has(permission));
}

export function hasRole(auth: AuthContext, ...slugs: string[]): boolean {
  return slugs.includes(auth.role.slug);
}

/** Exige sessão e uma das permissões informadas. */
export async function requirePermission(...permissions: string[]): Promise<AuthContext> {
  const auth = await requireSession();
  if (!canAny(auth, ...permissions)) {
    throw forbidden(`Seu papel (${auth.role.name}) não permite esta ação.`, "missing_permission");
  }
  return auth;
}

/** Exige sessão e que o papel seja um dos informados. */
export async function requireRole(...slugs: string[]): Promise<AuthContext> {
  const auth = await requireSession();
  if (!hasRole(auth, ...slugs)) {
    throw forbidden(`Esta ação é restrita a: ${slugs.join(", ")}.`, "missing_role");
  }
  return auth;
}

/** Metadados da requisição guardados na sessão. */
export function requestMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return {
    ipAddress: forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null,
    userAgent: request.headers.get("user-agent"),
  };
}
