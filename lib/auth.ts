// Sessão própria do Nonia: token opaco no cookie httpOnly, estado no banco.
//
// O cookie carrega só um token aleatório de 256 bits; o banco guarda o
// SHA-256 dele. Um vazamento da tabela `sessions` não permite montar um
// cookie válido, e a validação continua sendo uma busca por índice único.

import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { Op, fn, type Transaction } from "sequelize";
import { forbidden, unauthorized } from "@/lib/http";
import {
  Organization,
  OrganizationMember,
  Role as RoleModel,
  RolePermission,
  Session,
  User,
} from "@/lib/models";
import { assertWritable } from "@/lib/subscription-state";

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
  user: { id: string; email: string; fullName: string; phone: string | null; avatarUrl: string | null };
  // `timezone` entra aqui, e não numa consulta à parte, porque toda regra de
  // NEGÓCIO que fala em "hoje" precisa do fuso da igreja e toda rota já carrega
  // este contexto. Ver lib/datas.ts para o motivo de "hoje" não poder sair de
  // toISOString().
  organization: { id: string; name: string; slug: string; status: string; timezone: string };
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

  await Session.create(
    {
      userId,
      organizationId: organizationIdValue,
      tokenHash: hashToken(token),
      ipAddress: meta.ipAddress || null,
      userAgent: meta.userAgent?.slice(0, 400) || null,
      expiresAt,
    },
    { transaction },
  );

  return { token, expiresAt };
}

export async function revokeSession(token: string) {
  await Session.update(
    { revokedAt: new Date() },
    { where: { tokenHash: hashToken(token), revokedAt: null } },
  );
}

export async function revokeAllUserSessions(userId: string, transaction?: Transaction) {
  await Session.update(
    { revokedAt: new Date() },
    { where: { userId, revokedAt: null }, transaction },
  );
}

/**
 * Conta uma senha errada e tranca a conta ao chegar no limite.
 *
 * Usado pelo login e pela troca de senha, com os mesmos números: um contador
 * separado daria um caminho de força bruta sem trava.
 *
 * O INCREMENTO É DO BANCO: `increment` é um `UPDATE ... SET n = n + 1`, nunca
 * lido-somado-gravado aqui, então duas tentativas simultâneas contam duas. O
 * `RETURNING` devolve a contagem JÁ somada, e é ela que decide a trava.
 *
 * Era um único UPDATE com `literal("CASE WHEN ... THEN now() + ...")`, e morreu
 * no build de PRODUÇÃO: o compilador juntou as duas partes da string e engoliu
 * o espaço, gerando `>= 5THEN` -- Postgres recusa, e toda senha errada virava
 * 500 em vez de 401, sem trava nenhuma. Em `next dev` passava. Medido em
 * 12/09/2026 contra o build standalone. SQL em string não entra mais aqui.
 */
export async function registrarSenhaErrada(userId: string, limite: { tentativas: number; minutos: number }) {
  // `returning` funciona no Postgres, mas os tipos do Sequelize v6 não o
  // declaram em `increment` -- por isso as opções vão por variável.
  const opcoes = { by: 1, where: { id: userId }, returning: ["failed_login_attempts"] };
  const resultado = await User.increment("failedLoginAttempts", opcoes);
  // O formato do retorno do `increment` no Postgres é `[[[linha], n], n]`.
  // Procura a linha em vez de confiar na profundidade.
  const linha = (resultado as unknown[]).flat(3).find(
    (item): item is { failed_login_attempts: number } =>
      typeof item === "object" && item !== null && "failed_login_attempts" in item,
  );
  if (linha && linha.failed_login_attempts >= limite.tentativas) {
    // Relógio da aplicação, o mesmo que confere a trava (`lockedUntil > Date.now()`).
    await User.update(
      { lockedUntil: new Date(Date.now() + limite.minutos * 60 * 1000) },
      { where: { id: userId } },
    );
  }
}

/** Remove sessões expiradas ou revogadas há mais de 30 dias. */
export async function purgeStaleSessions() {
  const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await Session.destroy({
    where: {
      [Op.or]: [
        { expiresAt: { [Op.lt]: limite } },
        { revokedAt: { [Op.ne]: null, [Op.lt]: limite } },
      ],
    },
  });
}

type SessionRow = {
  sessionId: string;
  expiresAt: Date;
  lastSeenAt: Date;
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  userStatus: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationStatus: string;
  organizationTimezone: string;
  membershipStatus: string;
  personId: string | null;
  roleSlug: string;
  roleName: string;
  roleLevel: number;
  permissions: string[];
};

/**
 * A linha da sessão com tudo o que o contexto precisa, ou null.
 *
 * O que conta como sessão VÁLIDA mora nas condições abaixo, e cada uma é
 * obrigatória -- tirar qualquer uma é falha de segurança:
 *
 *   token_hash igual      o banco guarda só o SHA-256 do token
 *   revoked_at IS NULL    logout, troca de senha e suspensão revogam
 *   expires_at > now()    comparado com o relógio do BANCO (fn("now")), como
 *                         sempre foi, e não com o do servidor da aplicação
 *   usuário existe        INNER JOIN (`required: true`)
 *   organização existe    INNER JOIN (`required: true`)
 *   vínculo existe        a busca do vínculo na organização DA SESSÃO
 *   papel existe          INNER JOIN no vínculo (`required: true`)
 *
 * Status de usuário, vínculo e organização são conferidos por quem chama,
 * porque cada um tem uma consequência diferente (null ou 403).
 *
 * Três consultas em vez de uma: `organization_members` casa com a sessão por
 * DUAS colunas (organização e usuário), e a associação do Sequelize conhece
 * uma só -- a segunda consulta usa o par que a primeira devolveu. A terceira
 * traz as permissões do papel (o antigo LEFT JOIN + array_agg): papel sem
 * permissão nenhuma continua valendo, com o conjunto vazio.
 */
async function loadSessionRow(token: string): Promise<SessionRow | null> {
  const sessao = await Session.findOne({
    attributes: ["id", "expiresAt", "lastSeenAt", "userId", "organizationId"],
    where: {
      tokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: { [Op.gt]: fn("now") },
    },
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "email", "fullName", "phone", "avatarUrl", "status"],
        required: true,
      },
      {
        model: Organization,
        as: "organization",
        attributes: ["id", "name", "slug", "status", "timezone"],
        required: true,
      },
    ],
  });
  if (!sessao) return null;

  const { user, organization } = sessao as Session & { user: User; organization: Organization };

  const vinculo = await OrganizationMember.findOne({
    attributes: ["status", "personId", "roleId"],
    where: { organizationId: sessao.organizationId, userId: sessao.userId },
    include: [{ model: RoleModel, as: "role", attributes: ["id", "slug", "name", "level"], required: true }],
  });
  if (!vinculo) return null;

  const { role } = vinculo as OrganizationMember & { role: RoleModel };

  const permissoes = await RolePermission.findAll({
    attributes: ["permissionSlug"],
    where: { roleId: role.id },
    raw: true,
  });

  return {
    sessionId: sessao.id,
    expiresAt: sessao.expiresAt,
    lastSeenAt: sessao.lastSeenAt,
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    userStatus: user.status,
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    organizationStatus: organization.status,
    organizationTimezone: organization.timezone,
    membershipStatus: vinculo.status,
    personId: vinculo.personId,
    roleSlug: role.slug,
    roleName: role.name,
    roleLevel: role.level,
    permissions: permissoes.map((p) => p.permissionSlug),
  };
}

async function loadContext(token: string): Promise<AuthContext | null> {
  const row = await loadSessionRow(token);
  if (!row) return null;
  if (row.userStatus !== "active" || row.membershipStatus !== "active") return null;

  if (row.organizationStatus !== "active") {
    throw forbidden(
      "A assinatura desta organização está suspensa. Fale com o responsável pela conta.",
      "organization_suspended",
    );
  }

  const now = Date.now();
  const current = new Date(row.expiresAt);
  const shouldRenew = current.getTime() - now < SESSION_RENEW_THRESHOLD_MS;
  const shouldTouch = now - new Date(row.lastSeenAt).getTime() > LAST_SEEN_THROTTLE_MS;
  const expiresAt = shouldRenew ? new Date(now + SESSION_TTL_MS) : current;

  if (shouldRenew || shouldTouch) {
    await Session.update({ lastSeenAt: new Date(), expiresAt }, { where: { id: row.sessionId } });
  }

  return {
    sessionId: row.sessionId,
    expiresAt,
    user: {
      id: row.userId,
      email: row.email,
      fullName: row.fullName,
      phone: row.phone,
      avatarUrl: row.avatarUrl,
    },
    organization: {
      id: row.organizationId,
      name: row.organizationName,
      slug: row.organizationSlug,
      status: row.organizationStatus,
      timezone: row.organizationTimezone,
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

/**
 * Exige sessão e uma das permissões informadas.
 *
 * É também o gargalo do modo somente leitura: quando TODAS as permissões
 * pedidas são de escrita, a chamada é uma escrita, e uma igreja com pagamento
 * vencido além da carência é recusada aqui. Rotas de leitura passam intactas,
 * porque pedem uma permissão `.read` -- inclusive as que aceitam as duas, como
 * a listagem de papéis.
 *
 * Ficar aqui, e não em cada rota, é o que garante que uma rota nova não nasça
 * furando o modo somente leitura por esquecimento.
 */
/**
 * "Esta permissão MUDA alguma coisa?" -- e a pergunta é feita pela negativa de
 * propósito.
 *
 * Enquanto isto foi `endsWith(".write")`, o predicado era um proxy: funcionava
 * porque só existiam duas ações. `whatsapp.broadcast` quebrou o proxy em
 * silêncio -- disparar para 500 pessoas não termina em `.write`, então a guarda
 * de somente leitura não pegava, e uma igreja em atraso continuaria disparando.
 *
 * Pela negativa, ação nova entra como escrita até que alguém a declare leitura.
 * Falha fechado, que é o mesmo critério de "não existe ilimitado por acidente".
 */
const isWrite = (permission: string) => !permission.endsWith(".read");

export async function requirePermission(...permissions: string[]): Promise<AuthContext> {
  const auth = await requireSession();
  if (!canAny(auth, ...permissions)) {
    throw forbidden(
      `Seu papel (${auth.role.name}) não permite esta ação. ` +
        "Peça a um responsável pela conta (proprietário ou administrador).",
      "missing_permission",
    );
  }
  if (permissions.length > 0 && permissions.every(isWrite)) {
    await assertWritable(auth.organization.id);
  }
  return auth;
}

/**
 * Sessão + `billing.write`, DE PROPÓSITO sem a guarda de somente leitura.
 *
 * Exceção nomeada, e existe para exatamente duas rotas: contratar
 * (POST /api/billing/subscribe) e cancelar (POST /api/billing/cancel).
 *
 * POR QUE: a guarda de somente leitura existe por causa de inadimplência, e
 * cobrar de quem está inadimplente exige deixá-lo pagar. Sem esta exceção a
 * igreja vira somente leitura POR CAUSA da cobrança e as duas únicas ações
 * que a tirariam de lá ficam bloqueadas -- impasse sem saída pelo produto.
 * Foi assim que nasceu, e uma jornada completa foi o que revelou.
 *
 * NÃO GENERALIZE. Não recebe parâmetro nenhum de propósito: a permissão é
 * fixa, então isto não vira lista onde se acrescenta uma rota sem pensar.
 * Precisou isentar outra coisa? Escreva outra função e pense de novo.
 *
 * PENDÊNCIA que mora aqui: quando houver cobrança de verdade, isentar o
 * cancelamento passa a ser uma saída para a dívida -- cancelar devolveria a
 * escrita no plano gratuito e apagaria a inadimplência. A regra "cancelar
 * assinatura vencida não limpa a dívida" tem que ser aplicada neste ponto.
 * Hoje não é explorável porque nenhum dinheiro troca de mãos.
 */
export async function requireBillingWriteEvenWhenReadOnly(): Promise<AuthContext> {
  const auth = await requireSession();
  if (!can(auth, "billing.write")) {
    // Aqui é o proprietário, e só ele: nem o administrador contrata.
    throw forbidden(
      `Seu papel (${auth.role.name}) não permite esta ação. ` +
        "Só o proprietário da conta contrata ou cancela um plano.",
      "missing_permission",
    );
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
