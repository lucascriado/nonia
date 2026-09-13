import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from "sequelize";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

export class Person extends Model<InferAttributes<Person>, InferCreationAttributes<Person>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare fullName: string;
  declare email: string | null;
  declare phone: string | null;
  declare birthDate: string | null;
  declare gender: string | null;
  declare maritalStatus: string | null;
  declare cpf: string | null;
  declare zipCode: string | null;
  declare address: string | null;
  declare neighborhood: string | null;
  declare city: string | null;
  declare state: string | null;
  declare avatarUrl: string | null;
  declare notes: string | null;
}

Person.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  fullName: { type: DataTypes.STRING(160), allowNull: false, field: "full_name" },
  // Opcional desde a 014; único por organização quando preenchido.
  email: { type: DataTypes.STRING(254) },
  phone: DataTypes.STRING(30),
  birthDate: { type: DataTypes.DATEONLY, field: "birth_date" },
  gender: DataTypes.STRING(30),
  maritalStatus: { type: DataTypes.STRING(30), field: "marital_status" },
  cpf: DataTypes.STRING(14),
  zipCode: { type: DataTypes.STRING(9), field: "zip_code" },
  address: DataTypes.STRING(200),
  neighborhood: DataTypes.STRING(100),
  city: DataTypes.STRING(100),
  state: DataTypes.STRING(80),
  avatarUrl: { type: DataTypes.TEXT, field: "avatar_url" },
  notes: DataTypes.TEXT,
}, { sequelize: db, tableName: "people", createdAt: "created_at", updatedAt: "updated_at" });

export class Ministry extends Model<InferAttributes<Ministry>, InferCreationAttributes<Ministry>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare name: string;
  declare color: string;
  declare description: string | null;
  declare leaderId: string | null;
}

Ministry.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  name: { type: DataTypes.STRING(80), allowNull: false },
  color: { type: DataTypes.STRING(20), allowNull: false },
  description: DataTypes.TEXT,
  // Aponta para `people`, sem UNIQUE: a mesma pessoa lidera quantos quiser.
  leaderId: { type: DataTypes.UUID, field: "leader_id" },
}, { sequelize: db, tableName: "ministries", createdAt: "created_at", updatedAt: "updated_at" });

export class Member extends Model<InferAttributes<Member>, InferCreationAttributes<Member>> {
  declare personId: string;
  declare organizationId: string;
  declare ministryId: string | null;
  declare role: string;
  declare status: string;
  declare baptismStatus: string;
  declare baptismDate: string | null;
  declare admissionDate: CreationOptional<string>;
  declare isNew: CreationOptional<boolean>;
  declare cellName: CreationOptional<string>;
}

Member.init({
  personId: { type: DataTypes.UUID, primaryKey: true, field: "person_id" },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  ministryId: { type: DataTypes.UUID, field: "ministry_id" },
  role: { type: DataTypes.STRING(80), allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false },
  baptismStatus: { type: DataTypes.STRING(20), allowNull: false, field: "baptism_status" },
  baptismDate: { type: DataTypes.DATEONLY, field: "baptism_date" },
  admissionDate: { type: DataTypes.DATEONLY, field: "admission_date" },
  // Coluna sem leitor: ver o comentário de DIAS_VISITA_RECENTE em lib/listings.ts.
  isNew: { type: DataTypes.BOOLEAN, allowNull: false, field: "is_new", defaultValue: false },
  cellName: { type: DataTypes.STRING(120), allowNull: false, field: "cell_name", defaultValue: "Sem célula" },
}, { sequelize: db, tableName: "members", createdAt: "created_at", updatedAt: "updated_at" });

export class Visitor extends Model<InferAttributes<Visitor>, InferCreationAttributes<Visitor>> {
  declare personId: string;
  declare organizationId: string;
  declare visitDate: CreationOptional<string>;
  declare invitedBy: string;
  declare followUpStatus: string;
  declare membershipStage: string;
  declare isRecent: CreationOptional<boolean>;
}

Visitor.init({
  personId: { type: DataTypes.UUID, primaryKey: true, field: "person_id" },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  visitDate: { type: DataTypes.DATEONLY, field: "visit_date" },
  invitedBy: { type: DataTypes.STRING(160), allowNull: false, field: "invited_by" },
  followUpStatus: { type: DataTypes.STRING(30), allowNull: false, field: "follow_up_status" },
  membershipStage: { type: DataTypes.STRING(30), allowNull: false, field: "membership_stage" },
  // Idem: existe no schema, ninguém lê, e não é mais gravada.
  isRecent: { type: DataTypes.BOOLEAN, allowNull: false, field: "is_recent", defaultValue: true },
}, { sequelize: db, tableName: "visitors", createdAt: "created_at", updatedAt: "updated_at" });

export class Activity extends Model<InferAttributes<Activity>, InferCreationAttributes<Activity>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare actorUserId: string | null;
  declare category: string;
  declare actor: string;
  declare action: string;
  declare subject: string | null;
  declare details: string | null;
  declare occurredAt: CreationOptional<Date>;
}

Activity.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  actorUserId: { type: DataTypes.UUID, field: "actor_user_id" },
  category: { type: DataTypes.STRING(30), allowNull: false },
  actor: { type: DataTypes.STRING(120), allowNull: false },
  action: { type: DataTypes.STRING(200), allowNull: false },
  subject: DataTypes.STRING(160),
  details: DataTypes.TEXT,
  occurredAt: { type: DataTypes.DATE, allowNull: false, field: "occurred_at" },
}, { sequelize: db, tableName: "activities", createdAt: "created_at", updatedAt: false });

export class FinancialTransaction extends Model<InferAttributes<FinancialTransaction>, InferCreationAttributes<FinancialTransaction>> {
  declare id: CreationOptional<string>;
  // Exclusão lógica explícita, e não o modo `paranoid` do Sequelize: o filtro
  // de lixeira precisa estar VISÍVEL na consulta (lib/listings.ts), em vez de
  // acontecer por mágica -- a lixeira é justamente a consulta que quer os excluídos.
  declare deletedAt: Date | null;
  declare deletedBy: string | null;
  declare organizationId: string;
  declare type: string;
  declare description: string;
  declare category: string;
  declare counterparty: string | null;
  declare amount: string;
  declare status: string;
  declare transactionDate: CreationOptional<string>;
  declare paymentMethod: string | null;
  declare attachmentUrl: string | null;
  declare attachmentName: string | null;
  declare notes: string | null;
  // DECLARAÇÃO de quem lançou, não dedução de `transactionDate`. Ver o
  // cabeçalho da migration 019.
  declare retroactive: CreationOptional<boolean>;
  declare retroactiveReason: string | null;
}

FinancialTransaction.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  type: { type: DataTypes.STRING(10), allowNull: false },
  description: { type: DataTypes.STRING(160), allowNull: false },
  category: { type: DataTypes.STRING(60), allowNull: false },
  counterparty: DataTypes.STRING(160),
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "paid" },
  // SEM defaultValue, de propósito. Ele era new Date().toISOString().slice(0,10)
  // -- a data em UTC --, e nunca chegou a rodar: a única criação de lançamento
  // passa por `financeAttributes`, que sempre manda `transactionDate`, e a
  // validação recusa payload sem data. Era um "hoje" errado esperando a
  // primeira chamada que esquecesse o campo. O Model não tem como acertar
  // aqui: ele não sabe de qual igreja é a linha, e o fuso é da igreja.
  transactionDate: { type: DataTypes.DATEONLY, allowNull: false, field: "transaction_date" },
  paymentMethod: { type: DataTypes.STRING(40), field: "payment_method" },
  attachmentUrl: { type: DataTypes.TEXT, field: "attachment_url" },
  attachmentName: { type: DataTypes.STRING(160), field: "attachment_name" },
  notes: DataTypes.TEXT,
  deletedAt: { type: DataTypes.DATE, field: "deleted_at" },
  deletedBy: { type: DataTypes.UUID, field: "deleted_by" },
  retroactive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  retroactiveReason: { type: DataTypes.STRING(200), field: "retroactive_reason" },
}, { sequelize: db, tableName: "financial_transactions", createdAt: "created_at", updatedAt: "updated_at" });

/**
 * Uma forma de pagamento de um lançamento DIVIDIDO.
 *
 * Lançamento com forma única NÃO tem linha aqui — a forma dele mora em
 * `financial_transactions.payment_method`. Duas representações do mesmo
 * estado divergiriam, e o banco recusa a divisão de uma parte só.
 *
 * A soma das partes fechar com o total é garantia de BANCO (constraint
 * trigger diferida, migration 021), não deste Model.
 */
export class FinancialTransactionPayment extends Model<
  InferAttributes<FinancialTransactionPayment>,
  InferCreationAttributes<FinancialTransactionPayment>
> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare transactionId: string;
  declare paymentMethod: string;
  declare amount: string;
}

FinancialTransactionPayment.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  transactionId: { type: DataTypes.UUID, allowNull: false, field: "transaction_id" },
  paymentMethod: { type: DataTypes.STRING(40), allowNull: false, field: "payment_method" },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
}, { sequelize: db, tableName: "financial_transaction_payments", createdAt: "created_at", updatedAt: "updated_at" });

// ---------------------------------------------------------------------------
// SaaS: organizações, usuários, sessões, RBAC e cobrança.
// ---------------------------------------------------------------------------

export class Organization extends Model<InferAttributes<Organization>, InferCreationAttributes<Organization>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare slug: string;
  declare document: string | null;
  declare email: string | null;
  declare phone: string | null;
  declare status: CreationOptional<string>;
  declare timezone: CreationOptional<string>;
  declare settings: CreationOptional<object>;
}

Organization.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  name: { type: DataTypes.STRING(160), allowNull: false },
  slug: { type: DataTypes.STRING(80), allowNull: false },
  document: DataTypes.STRING(18),
  email: DataTypes.STRING(254),
  phone: DataTypes.STRING(30),
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "active" },
  timezone: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "America/Sao_Paulo" },
  settings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, { sequelize: db, tableName: "organizations", createdAt: "created_at", updatedAt: "updated_at" });

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare passwordHash: string | null;
  declare fullName: string;
  declare phone: string | null;
  declare avatarUrl: string | null;
  declare status: CreationOptional<string>;
  declare emailVerifiedAt: Date | null;
  declare lastLoginAt: Date | null;
  declare failedLoginAttempts: CreationOptional<number>;
  declare lockedUntil: Date | null;
}

User.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  email: { type: DataTypes.STRING(254), allowNull: false },
  passwordHash: { type: DataTypes.TEXT, field: "password_hash" },
  fullName: { type: DataTypes.STRING(160), allowNull: false, field: "full_name" },
  phone: DataTypes.STRING(30),
  avatarUrl: { type: DataTypes.TEXT, field: "avatar_url" },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "active" },
  emailVerifiedAt: { type: DataTypes.DATE, field: "email_verified_at" },
  lastLoginAt: { type: DataTypes.DATE, field: "last_login_at" },
  failedLoginAttempts: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0, field: "failed_login_attempts" },
  lockedUntil: { type: DataTypes.DATE, field: "locked_until" },
}, { sequelize: db, tableName: "users", createdAt: "created_at", updatedAt: "updated_at" });

export class Role extends Model<InferAttributes<Role>, InferCreationAttributes<Role>> {
  declare id: CreationOptional<string>;
  declare organizationId: string | null;
  declare slug: string;
  declare name: string;
  declare description: string | null;
  declare level: CreationOptional<number>;
  declare isSystem: CreationOptional<boolean>;
}

Role.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, field: "organization_id" },
  slug: { type: DataTypes.STRING(40), allowNull: false },
  name: { type: DataTypes.STRING(80), allowNull: false },
  description: DataTypes.STRING(200),
  level: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
  isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: "is_system" },
}, { sequelize: db, tableName: "roles", createdAt: "created_at", updatedAt: "updated_at" });

export class OrganizationMember extends Model<InferAttributes<OrganizationMember>, InferCreationAttributes<OrganizationMember>> {
  declare organizationId: string;
  declare userId: string;
  declare roleId: string;
  declare personId: string | null;
  declare status: CreationOptional<string>;
  declare isDefault: CreationOptional<boolean>;
  declare invitedBy: string | null;
  declare joinedAt: CreationOptional<Date>;
}

OrganizationMember.init({
  organizationId: { type: DataTypes.UUID, primaryKey: true, field: "organization_id" },
  userId: { type: DataTypes.UUID, primaryKey: true, field: "user_id" },
  roleId: { type: DataTypes.UUID, allowNull: false, field: "role_id" },
  personId: { type: DataTypes.UUID, field: "person_id" },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "active" },
  isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: "is_default" },
  invitedBy: { type: DataTypes.UUID, field: "invited_by" },
  joinedAt: { type: DataTypes.DATE, allowNull: false, field: "joined_at", defaultValue: () => new Date() },
}, { sequelize: db, tableName: "organization_members", createdAt: "created_at", updatedAt: "updated_at" });

export class Session extends Model<InferAttributes<Session>, InferCreationAttributes<Session>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare organizationId: string;
  declare tokenHash: string;
  declare ipAddress: string | null;
  declare userAgent: string | null;
  declare lastSeenAt: CreationOptional<Date>;
  declare expiresAt: Date;
  declare revokedAt: Date | null;
}

Session.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  userId: { type: DataTypes.UUID, allowNull: false, field: "user_id" },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  tokenHash: { type: DataTypes.TEXT, allowNull: false, field: "token_hash" },
  ipAddress: { type: DataTypes.STRING, field: "ip_address" },
  userAgent: { type: DataTypes.STRING(400), field: "user_agent" },
  lastSeenAt: { type: DataTypes.DATE, allowNull: false, field: "last_seen_at", defaultValue: () => new Date() },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: "expires_at" },
  revokedAt: { type: DataTypes.DATE, field: "revoked_at" },
}, { sequelize: db, tableName: "sessions", createdAt: "created_at", updatedAt: false });

export class Invitation extends Model<InferAttributes<Invitation>, InferCreationAttributes<Invitation>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare email: string;
  declare fullName: string | null;
  declare roleId: string;
  declare tokenHash: string;
  declare status: CreationOptional<string>;
  declare invitedBy: string | null;
  declare acceptedUserId: string | null;
  declare acceptedAt: Date | null;
  declare expiresAt: Date;
}

Invitation.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  email: { type: DataTypes.STRING(254), allowNull: false },
  fullName: { type: DataTypes.STRING(160), field: "full_name" },
  roleId: { type: DataTypes.UUID, allowNull: false, field: "role_id" },
  tokenHash: { type: DataTypes.TEXT, allowNull: false, field: "token_hash" },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "pending" },
  invitedBy: { type: DataTypes.UUID, field: "invited_by" },
  acceptedUserId: { type: DataTypes.UUID, field: "accepted_user_id" },
  acceptedAt: { type: DataTypes.DATE, field: "accepted_at" },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: "expires_at" },
}, { sequelize: db, tableName: "invitations", createdAt: "created_at", updatedAt: "updated_at" });

export class Plan extends Model<InferAttributes<Plan>, InferCreationAttributes<Plan>> {
  declare id: CreationOptional<string>;
  declare slug: string;
  declare name: string;
  declare description: string | null;
  declare priceCents: CreationOptional<number>;
  declare currency: CreationOptional<string>;
  declare billingPeriod: CreationOptional<string>;
  declare trialDays: CreationOptional<number>;
  declare maxUsers: number | null;
  declare maxMembers: number | null;
  declare features: CreationOptional<object>;
  declare isActive: CreationOptional<boolean>;
  declare sortOrder: CreationOptional<number>;
}

Plan.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  slug: { type: DataTypes.STRING(40), allowNull: false },
  name: { type: DataTypes.STRING(80), allowNull: false },
  description: DataTypes.STRING(300),
  priceCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "price_cents" },
  currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: "BRL" },
  billingPeriod: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "monthly", field: "billing_period" },
  trialDays: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0, field: "trial_days" },
  maxUsers: { type: DataTypes.INTEGER, field: "max_users" },
  maxMembers: { type: DataTypes.INTEGER, field: "max_members" },
  features: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: "is_active" },
  sortOrder: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0, field: "sort_order" },
}, { sequelize: db, tableName: "plans", createdAt: "created_at", updatedAt: "updated_at" });

export class Subscription extends Model<InferAttributes<Subscription>, InferCreationAttributes<Subscription>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare planId: string;
  declare status: CreationOptional<string>;
  declare startedAt: CreationOptional<Date>;
  declare trialEndsAt: Date | null;
  declare currentPeriodStart: Date | null;
  declare currentPeriodEnd: Date | null;
  declare cancelAtPeriodEnd: CreationOptional<boolean>;
  declare canceledAt: Date | null;
  declare endedAt: Date | null;
  // Preenchidos pela integração de pagamento; o domínio não depende deles.
  declare provider: string | null;
  declare providerCustomerId: string | null;
  declare providerSubscriptionId: string | null;
  declare metadata: CreationOptional<object>;
}

Subscription.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  planId: { type: DataTypes.UUID, allowNull: false, field: "plan_id" },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "trialing" },
  startedAt: { type: DataTypes.DATE, allowNull: false, field: "started_at", defaultValue: () => new Date() },
  trialEndsAt: { type: DataTypes.DATE, field: "trial_ends_at" },
  currentPeriodStart: { type: DataTypes.DATE, field: "current_period_start" },
  currentPeriodEnd: { type: DataTypes.DATE, field: "current_period_end" },
  cancelAtPeriodEnd: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: "cancel_at_period_end" },
  canceledAt: { type: DataTypes.DATE, field: "canceled_at" },
  endedAt: { type: DataTypes.DATE, field: "ended_at" },
  provider: DataTypes.STRING(30),
  providerCustomerId: { type: DataTypes.STRING(120), field: "provider_customer_id" },
  providerSubscriptionId: { type: DataTypes.STRING(120), field: "provider_subscription_id" },
  metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, { sequelize: db, tableName: "subscriptions", createdAt: "created_at", updatedAt: "updated_at" });

export class SubscriptionPayment extends Model<InferAttributes<SubscriptionPayment>, InferCreationAttributes<SubscriptionPayment>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare subscriptionId: string | null;
  declare amountCents: number;
  declare currency: CreationOptional<string>;
  declare status: CreationOptional<string>;
  declare method: string | null;
  declare description: string | null;
  declare dueDate: string | null;
  declare paidAt: Date | null;
  declare payerName: string | null;
  declare payerDocument: string | null;
  declare payerEmail: string | null;
  declare provider: string | null;
  declare providerPaymentId: string | null;
  declare externalReference: string | null;
  declare checkoutUrl: string | null;
  // O QR e o copia-e-cola do Pix moram aqui (ver "Mercado Pago" no CLAUDE.md).
  declare payload: CreationOptional<object>;
}

SubscriptionPayment.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  subscriptionId: { type: DataTypes.UUID, field: "subscription_id" },
  amountCents: { type: DataTypes.INTEGER, allowNull: false, field: "amount_cents" },
  currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: "BRL" },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "pending" },
  method: DataTypes.STRING(20),
  description: DataTypes.STRING(160),
  dueDate: { type: DataTypes.DATEONLY, field: "due_date" },
  paidAt: { type: DataTypes.DATE, field: "paid_at" },
  payerName: { type: DataTypes.STRING(160), field: "payer_name" },
  payerDocument: { type: DataTypes.STRING(18), field: "payer_document" },
  payerEmail: { type: DataTypes.STRING(254), field: "payer_email" },
  provider: DataTypes.STRING(30),
  providerPaymentId: { type: DataTypes.STRING(120), field: "provider_payment_id" },
  externalReference: { type: DataTypes.STRING(120), field: "external_reference" },
  checkoutUrl: { type: DataTypes.TEXT, field: "checkout_url" },
  payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, { sequelize: db, tableName: "subscription_payments", createdAt: "created_at", updatedAt: "updated_at" });

// ---------------------------------------------------------------------------
// Células, eventos e presença dos ministérios.
// ---------------------------------------------------------------------------

export class Cell extends Model<InferAttributes<Cell>, InferCreationAttributes<Cell>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare name: string;
  declare leaderId: string | null;
  declare address: string | null;
  declare meetingDay: CreationOptional<string>;
  declare meetingTime: CreationOptional<string>;
  declare color: CreationOptional<string>;
  declare notes: string | null;
}

Cell.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  name: { type: DataTypes.STRING(120), allowNull: false },
  leaderId: { type: DataTypes.UUID, field: "leader_id" },
  address: DataTypes.STRING(200),
  meetingDay: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "Domingo", field: "meeting_day" },
  meetingTime: { type: DataTypes.TIME, allowNull: false, defaultValue: "19:30:00", field: "meeting_time" },
  color: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "purple" },
  notes: DataTypes.TEXT,
}, { sequelize: db, tableName: "cells", createdAt: "created_at", updatedAt: "updated_at" });

/** `member_id` aponta para `members.person_id`, e é UNIQUE: uma célula por membro. */
export class CellMember extends Model<InferAttributes<CellMember>, InferCreationAttributes<CellMember>> {
  declare cellId: string;
  declare memberId: string;
  declare organizationId: string;
  declare joinedAt: CreationOptional<string>;
}

CellMember.init({
  cellId: { type: DataTypes.UUID, primaryKey: true, field: "cell_id" },
  memberId: { type: DataTypes.UUID, primaryKey: true, field: "member_id" },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  // Fica com o DEFAULT CURRENT_DATE do banco, por decisão: escrita pelo
  // default e nunca lida. Ver "cell_members.joined_at" no CLAUDE.md.
  joinedAt: { type: DataTypes.DATEONLY, field: "joined_at" },
}, { sequelize: db, tableName: "cell_members", timestamps: false });

export class Event extends Model<InferAttributes<Event>, InferCreationAttributes<Event>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare title: string;
  declare description: string | null;
  declare location: string;
  declare startsAt: Date;
  declare endsAt: Date | null;
  declare category: CreationOptional<string>;
  declare color: CreationOptional<string>;
}

Event.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  title: { type: DataTypes.STRING(160), allowNull: false },
  description: DataTypes.TEXT,
  location: { type: DataTypes.STRING(160), allowNull: false },
  startsAt: { type: DataTypes.DATE, allowNull: false, field: "starts_at" },
  endsAt: { type: DataTypes.DATE, field: "ends_at" },
  category: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "calendar" },
  color: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "purple" },
}, { sequelize: db, tableName: "events", createdAt: "created_at", updatedAt: "updated_at" });

/** Responsável do evento: aponta para `people`, não para `members` (migration 022). */
export class EventResponsible extends Model<InferAttributes<EventResponsible>, InferCreationAttributes<EventResponsible>> {
  declare eventId: string;
  declare personId: string;
  declare organizationId: string;
}

EventResponsible.init({
  eventId: { type: DataTypes.UUID, primaryKey: true, field: "event_id" },
  personId: { type: DataTypes.UUID, primaryKey: true, field: "person_id" },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
}, { sequelize: db, tableName: "event_responsibles", createdAt: "created_at", updatedAt: false });

export class MinistryAttendanceSession extends Model<
  InferAttributes<MinistryAttendanceSession>,
  InferCreationAttributes<MinistryAttendanceSession>
> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare ministryId: string;
  declare meetingDate: string;
  declare title: CreationOptional<string>;
}

MinistryAttendanceSession.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  ministryId: { type: DataTypes.UUID, allowNull: false, field: "ministry_id" },
  meetingDate: { type: DataTypes.DATEONLY, allowNull: false, field: "meeting_date" },
  title: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "Escola Bíblica Dominical" },
}, { sequelize: db, tableName: "ministry_attendance_sessions", createdAt: "created_at", updatedAt: "updated_at" });

/** `member_id` aponta para `members.person_id`. */
export class MinistryAttendanceRecord extends Model<
  InferAttributes<MinistryAttendanceRecord>,
  InferCreationAttributes<MinistryAttendanceRecord>
> {
  declare sessionId: string;
  declare memberId: string;
  declare organizationId: string;
  declare present: CreationOptional<boolean>;
  declare notes: string | null;
}

MinistryAttendanceRecord.init({
  sessionId: { type: DataTypes.UUID, primaryKey: true, field: "session_id" },
  memberId: { type: DataTypes.UUID, primaryKey: true, field: "member_id" },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  present: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  notes: DataTypes.TEXT,
}, { sequelize: db, tableName: "ministry_attendance_records", createdAt: false, updatedAt: "updated_at" });

// ---------------------------------------------------------------------------
// RBAC e eventos de cobrança.
// ---------------------------------------------------------------------------

export class Permission extends Model<InferAttributes<Permission>, InferCreationAttributes<Permission>> {
  declare slug: string;
  declare resource: string;
  declare action: string;
  declare description: string;
}

Permission.init({
  slug: { type: DataTypes.STRING(60), primaryKey: true },
  resource: { type: DataTypes.STRING(40), allowNull: false },
  action: { type: DataTypes.STRING(20), allowNull: false },
  description: { type: DataTypes.STRING(160), allowNull: false },
}, { sequelize: db, tableName: "permissions", timestamps: false });

export class RolePermission extends Model<InferAttributes<RolePermission>, InferCreationAttributes<RolePermission>> {
  declare roleId: string;
  declare permissionSlug: string;
}

RolePermission.init({
  roleId: { type: DataTypes.UUID, primaryKey: true, field: "role_id" },
  permissionSlug: { type: DataTypes.STRING(60), primaryKey: true, field: "permission_slug" },
}, { sequelize: db, tableName: "role_permissions", timestamps: false });

export class BillingEvent extends Model<InferAttributes<BillingEvent>, InferCreationAttributes<BillingEvent>> {
  declare id: CreationOptional<string>;
  declare provider: string;
  declare providerEventId: string | null;
  declare type: string;
  declare organizationId: string | null;
  declare paymentId: string | null;
  declare payload: CreationOptional<object>;
  declare receivedAt: CreationOptional<Date>;
  declare processedAt: Date | null;
  declare error: string | null;
}

BillingEvent.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  provider: { type: DataTypes.STRING(30), allowNull: false },
  providerEventId: { type: DataTypes.STRING(160), field: "provider_event_id" },
  type: { type: DataTypes.STRING(60), allowNull: false },
  organizationId: { type: DataTypes.UUID, field: "organization_id" },
  paymentId: { type: DataTypes.UUID, field: "payment_id" },
  payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  receivedAt: { type: DataTypes.DATE, allowNull: false, field: "received_at", defaultValue: () => new Date() },
  processedAt: { type: DataTypes.DATE, field: "processed_at" },
  error: DataTypes.TEXT,
}, { sequelize: db, tableName: "billing_events", timestamps: false });

// ---------------------------------------------------------------------------
// WhatsApp.
// ---------------------------------------------------------------------------

export class OrganizationWhatsapp extends Model<InferAttributes<OrganizationWhatsapp>, InferCreationAttributes<OrganizationWhatsapp>> {
  declare organizationId: string;
  declare sessionId: string;
  declare sessionName: string;
  declare apiKeyId: string | null;
  declare apiKeyEncrypted: string;
  declare apiKeyPrefix: string | null;
  declare status: CreationOptional<string>;
  declare phone: string | null;
  declare pushName: string | null;
  declare connectedAt: Date | null;
  declare lastCheckedAt: Date | null;
  declare chatsSyncedAt: Date | null;
  declare chatsKnown: CreationOptional<number>;
}

OrganizationWhatsapp.init({
  organizationId: { type: DataTypes.UUID, primaryKey: true, field: "organization_id" },
  sessionId: { type: DataTypes.STRING(64), allowNull: false, field: "session_id" },
  sessionName: { type: DataTypes.STRING(100), allowNull: false, field: "session_name" },
  apiKeyId: { type: DataTypes.STRING(64), field: "api_key_id" },
  apiKeyEncrypted: { type: DataTypes.TEXT, allowNull: false, field: "api_key_encrypted" },
  apiKeyPrefix: { type: DataTypes.STRING(12), field: "api_key_prefix" },
  status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "created" },
  phone: DataTypes.STRING(20),
  pushName: { type: DataTypes.STRING(100), field: "push_name" },
  connectedAt: { type: DataTypes.DATE, field: "connected_at" },
  lastCheckedAt: { type: DataTypes.DATE, field: "last_checked_at" },
  chatsSyncedAt: { type: DataTypes.DATE, field: "chats_synced_at" },
  chatsKnown: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "chats_known" },
}, { sequelize: db, tableName: "organization_whatsapp", createdAt: "created_at", updatedAt: "updated_at" });

export class WhatsappContact extends Model<InferAttributes<WhatsappContact>, InferCreationAttributes<WhatsappContact>> {
  declare organizationId: string;
  declare waId: string;
  declare name: string | null;
  declare lookedUpAt: CreationOptional<Date>;
  // URL, e não bytes: a foto do WhatsApp não é nossa e a URL expira (018).
  declare avatarUrl: string | null;
  declare avatarCheckedAt: Date | null;
}

WhatsappContact.init({
  organizationId: { type: DataTypes.UUID, primaryKey: true, field: "organization_id" },
  waId: { type: DataTypes.STRING(80), primaryKey: true, field: "wa_id" },
  name: DataTypes.STRING(160),
  lookedUpAt: { type: DataTypes.DATE, allowNull: false, field: "looked_up_at", defaultValue: () => new Date() },
  avatarUrl: { type: DataTypes.TEXT, field: "avatar_url" },
  avatarCheckedAt: { type: DataTypes.DATE, field: "avatar_checked_at" },
}, { sequelize: db, tableName: "whatsapp_contacts", createdAt: false, updatedAt: "updated_at" });

export class WhatsappConversation extends Model<InferAttributes<WhatsappConversation>, InferCreationAttributes<WhatsappConversation>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare chatId: string;
  declare kind: CreationOptional<string>;
  declare waName: string | null;
  declare phone: string | null;
  declare personId: string | null;
  declare lastMessageAt: Date | null;
  declare lastMessagePreview: string | null;
  declare unreadCount: CreationOptional<number>;
  declare syncCursor: string | null;
  declare syncedAt: Date | null;
  declare phoneLookupAt: Date | null;
}

WhatsappConversation.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  chatId: { type: DataTypes.STRING(80), allowNull: false, field: "chat_id" },
  kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "individual" },
  waName: { type: DataTypes.STRING(160), field: "wa_name" },
  phone: DataTypes.STRING(40),
  personId: { type: DataTypes.UUID, field: "person_id" },
  lastMessageAt: { type: DataTypes.DATE, field: "last_message_at" },
  lastMessagePreview: { type: DataTypes.STRING(300), field: "last_message_preview" },
  unreadCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "unread_count" },
  syncCursor: { type: DataTypes.STRING(190), field: "sync_cursor" },
  syncedAt: { type: DataTypes.DATE, field: "synced_at" },
  phoneLookupAt: { type: DataTypes.DATE, field: "phone_lookup_at" },
}, { sequelize: db, tableName: "whatsapp_conversations", createdAt: "created_at", updatedAt: "updated_at" });

export class WhatsappMessage extends Model<InferAttributes<WhatsappMessage>, InferCreationAttributes<WhatsappMessage>> {
  declare id: CreationOptional<string>;
  declare conversationId: string;
  declare organizationId: string;
  declare waMessageId: string;
  declare fromMe: CreationOptional<boolean>;
  declare author: string | null;
  declare authorName: string | null;
  declare type: CreationOptional<string>;
  declare body: string | null;
  declare sentAt: Date;
  declare quotedWaMessageId: string | null;
  declare mediaMimetype: string | null;
  declare mediaFilename: string | null;
}

WhatsappMessage.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  conversationId: { type: DataTypes.UUID, allowNull: false, field: "conversation_id" },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  waMessageId: { type: DataTypes.STRING(190), allowNull: false, field: "wa_message_id" },
  fromMe: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: "from_me" },
  author: DataTypes.STRING(80),
  authorName: { type: DataTypes.STRING(160), field: "author_name" },
  type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "text" },
  body: DataTypes.TEXT,
  sentAt: { type: DataTypes.DATE, allowNull: false, field: "sent_at" },
  quotedWaMessageId: { type: DataTypes.STRING(190), field: "quoted_wa_message_id" },
  mediaMimetype: { type: DataTypes.STRING(120), field: "media_mimetype" },
  mediaFilename: { type: DataTypes.STRING(255), field: "media_filename" },
}, { sequelize: db, tableName: "whatsapp_messages", createdAt: "created_at", updatedAt: false });

export class WhatsappBroadcast extends Model<InferAttributes<WhatsappBroadcast>, InferCreationAttributes<WhatsappBroadcast>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare createdBy: string | null;
  declare message: string;
  declare audience: string;
  declare filters: CreationOptional<object>;
  declare status: CreationOptional<string>;
  declare total: CreationOptional<number>;
  declare startedAt: Date | null;
  declare finishedAt: Date | null;
}

WhatsappBroadcast.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  createdBy: { type: DataTypes.UUID, field: "created_by" },
  message: { type: DataTypes.TEXT, allowNull: false },
  audience: { type: DataTypes.STRING(20), allowNull: false },
  filters: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "pending" },
  total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  startedAt: { type: DataTypes.DATE, field: "started_at" },
  finishedAt: { type: DataTypes.DATE, field: "finished_at" },
}, { sequelize: db, tableName: "whatsapp_broadcasts", createdAt: "created_at", updatedAt: "updated_at" });

export class WhatsappBroadcastRecipient extends Model<
  InferAttributes<WhatsappBroadcastRecipient>,
  InferCreationAttributes<WhatsappBroadcastRecipient>
> {
  declare id: CreationOptional<string>;
  declare broadcastId: string;
  declare organizationId: string;
  declare personId: string | null;
  declare name: string;
  declare phone: string | null;
  declare chatId: string | null;
  declare status: CreationOptional<string>;
  declare waBatchId: string | null;
  declare waMessageId: string | null;
  declare errorCode: string | null;
  declare errorMessage: string | null;
  declare sentAt: Date | null;
}

WhatsappBroadcastRecipient.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  broadcastId: { type: DataTypes.UUID, allowNull: false, field: "broadcast_id" },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  personId: { type: DataTypes.UUID, field: "person_id" },
  name: { type: DataTypes.STRING(160), allowNull: false },
  phone: DataTypes.STRING(40),
  chatId: { type: DataTypes.STRING(80), field: "chat_id" },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "pending" },
  waBatchId: { type: DataTypes.STRING(80), field: "wa_batch_id" },
  waMessageId: { type: DataTypes.STRING(190), field: "wa_message_id" },
  errorCode: { type: DataTypes.STRING(60), field: "error_code" },
  errorMessage: { type: DataTypes.STRING(300), field: "error_message" },
  sentAt: { type: DataTypes.DATE, field: "sent_at" },
}, { sequelize: db, tableName: "whatsapp_broadcast_recipients", createdAt: "created_at", updatedAt: false });

// ---------------------------------------------------------------------------
// Views de leitura (migration 002). SÓ LEITURA: nunca create/update/destroy.
// Não têm PK no banco; `id` é marcado como tal só porque o Sequelize exige.
// ---------------------------------------------------------------------------

const colunasDaPessoa = {
  id: { type: DataTypes.UUID, primaryKey: true },
  organizationId: { type: DataTypes.UUID, field: "organization_id" },
  fullName: { type: DataTypes.STRING(160), field: "full_name" },
  email: DataTypes.STRING(254),
  phone: DataTypes.STRING(30),
  birthDate: { type: DataTypes.DATEONLY, field: "birth_date" },
  gender: DataTypes.STRING(30),
  maritalStatus: { type: DataTypes.STRING(30), field: "marital_status" },
  cpf: DataTypes.STRING(14),
  zipCode: { type: DataTypes.STRING(9), field: "zip_code" },
  address: DataTypes.STRING(200),
  neighborhood: DataTypes.STRING(100),
  city: DataTypes.STRING(100),
  state: DataTypes.STRING(80),
  avatarUrl: { type: DataTypes.TEXT, field: "avatar_url" },
  notes: DataTypes.TEXT,
  createdAt: { type: DataTypes.DATE, field: "created_at" },
  updatedAt: { type: DataTypes.DATE, field: "updated_at" },
};

type PessoaDaView = {
  id: string; organizationId: string; fullName: string; email: string | null; phone: string | null;
  birthDate: string | null; gender: string | null; maritalStatus: string | null; cpf: string | null;
  zipCode: string | null; address: string | null; neighborhood: string | null; city: string | null;
  state: string | null; avatarUrl: string | null; notes: string | null; createdAt: Date; updatedAt: Date;
};

type MembroDaView = PessoaDaView & {
  ministry: string | null; ministryColor: string | null; role: string; status: string;
  baptismStatus: string; baptismDate: string | null; admissionDate: string; isNew: boolean; cellName: string;
};

// A interface de mesmo nome põe os campos tipados na instância -- é o papel
// que os `declare` cumprem nos Models de tabela.
export interface MemberDirectory extends MembroDaView {}
export class MemberDirectory extends Model<MembroDaView> {}

MemberDirectory.init({
  ...colunasDaPessoa,
  ministry: DataTypes.STRING,
  ministryColor: { type: DataTypes.STRING, field: "ministry_color" },
  role: DataTypes.STRING(80),
  status: DataTypes.STRING(20),
  baptismStatus: { type: DataTypes.STRING(20), field: "baptism_status" },
  baptismDate: { type: DataTypes.DATEONLY, field: "baptism_date" },
  admissionDate: { type: DataTypes.DATEONLY, field: "admission_date" },
  isNew: { type: DataTypes.BOOLEAN, field: "is_new" },
  cellName: { type: DataTypes.STRING(120), field: "cell_name" },
}, { sequelize: db, tableName: "member_directory", timestamps: false });

type VisitanteDaView = PessoaDaView & {
  visitDate: string; invitedBy: string; followUpStatus: string; isRecent: boolean; membershipStage: string;
};

export interface VisitorDirectory extends VisitanteDaView {}
export class VisitorDirectory extends Model<VisitanteDaView> {}

VisitorDirectory.init({
  ...colunasDaPessoa,
  visitDate: { type: DataTypes.DATEONLY, field: "visit_date" },
  invitedBy: { type: DataTypes.STRING(160), field: "invited_by" },
  followUpStatus: { type: DataTypes.STRING(30), field: "follow_up_status" },
  isRecent: { type: DataTypes.BOOLEAN, field: "is_recent" },
  membershipStage: { type: DataTypes.STRING(30), field: "membership_stage" },
}, { sequelize: db, tableName: "visitor_directory", timestamps: false });

// ---------------------------------------------------------------------------
// Associações.
//
// SÓ para `include`. Todas com `constraints: false`: quem garante a integridade
// é o banco, com FK composta `(id, organization_id)` desde a 006 -- o Sequelize
// nunca cria nem altera constraint aqui (e não há `sync` no projeto).
//
// A associação conhece UMA coluna, não o par com o tenant. Por isso todo
// `include` de tabela de domínio leva `where: { organizationId }` também: a
// FK composta é o backstop, não o filtro.
// ---------------------------------------------------------------------------

const semConstraint = { constraints: false } as const;

Member.belongsTo(Person, { ...semConstraint, foreignKey: "personId", as: "person" });
Person.hasOne(Member, { ...semConstraint, foreignKey: "personId", as: "member" });
Member.belongsTo(Ministry, { ...semConstraint, foreignKey: "ministryId", as: "ministryRecord" });
Ministry.hasMany(Member, { ...semConstraint, foreignKey: "ministryId", as: "members" });

Visitor.belongsTo(Person, { ...semConstraint, foreignKey: "personId", as: "person" });
Person.hasOne(Visitor, { ...semConstraint, foreignKey: "personId", as: "visitor" });

Ministry.belongsTo(Person, { ...semConstraint, foreignKey: "leaderId", as: "leader" });
Cell.belongsTo(Person, { ...semConstraint, foreignKey: "leaderId", as: "leader" });

Cell.hasMany(CellMember, { ...semConstraint, foreignKey: "cellId", as: "memberships" });
CellMember.belongsTo(Cell, { ...semConstraint, foreignKey: "cellId", as: "cell" });
CellMember.belongsTo(Member, { ...semConstraint, foreignKey: "memberId", targetKey: "personId", as: "member" });

Event.hasMany(EventResponsible, { ...semConstraint, foreignKey: "eventId", as: "responsibles" });
EventResponsible.belongsTo(Event, { ...semConstraint, foreignKey: "eventId", as: "event" });
EventResponsible.belongsTo(Person, { ...semConstraint, foreignKey: "personId", as: "person" });

Ministry.hasMany(MinistryAttendanceSession, { ...semConstraint, foreignKey: "ministryId", as: "attendanceSessions" });
MinistryAttendanceSession.belongsTo(Ministry, { ...semConstraint, foreignKey: "ministryId", as: "ministry" });
MinistryAttendanceSession.hasMany(MinistryAttendanceRecord, { ...semConstraint, foreignKey: "sessionId", as: "records" });
MinistryAttendanceRecord.belongsTo(MinistryAttendanceSession, { ...semConstraint, foreignKey: "sessionId", as: "session" });
MinistryAttendanceRecord.belongsTo(Member, { ...semConstraint, foreignKey: "memberId", targetKey: "personId", as: "member" });

FinancialTransaction.hasMany(FinancialTransactionPayment, { ...semConstraint, foreignKey: "transactionId", as: "payments" });
FinancialTransactionPayment.belongsTo(FinancialTransaction, { ...semConstraint, foreignKey: "transactionId", as: "transaction" });
FinancialTransaction.belongsTo(User, { ...semConstraint, foreignKey: "deletedBy", as: "deletedByUser" });

Activity.belongsTo(User, { ...semConstraint, foreignKey: "actorUserId", as: "actorUser" });

User.hasMany(OrganizationMember, { ...semConstraint, foreignKey: "userId", as: "memberships" });
OrganizationMember.belongsTo(User, { ...semConstraint, foreignKey: "userId", as: "user" });
OrganizationMember.belongsTo(Organization, { ...semConstraint, foreignKey: "organizationId", as: "organization" });
OrganizationMember.belongsTo(Role, { ...semConstraint, foreignKey: "roleId", as: "role" });
OrganizationMember.belongsTo(Person, { ...semConstraint, foreignKey: "personId", as: "person" });
Organization.hasMany(OrganizationMember, { ...semConstraint, foreignKey: "organizationId", as: "memberships" });

Role.hasMany(RolePermission, { ...semConstraint, foreignKey: "roleId", as: "rolePermissions" });
RolePermission.belongsTo(Role, { ...semConstraint, foreignKey: "roleId", as: "role" });
RolePermission.belongsTo(Permission, { ...semConstraint, foreignKey: "permissionSlug", targetKey: "slug", as: "permission" });

Session.belongsTo(User, { ...semConstraint, foreignKey: "userId", as: "user" });
Session.belongsTo(Organization, { ...semConstraint, foreignKey: "organizationId", as: "organization" });

Invitation.belongsTo(Organization, { ...semConstraint, foreignKey: "organizationId", as: "organization" });
Invitation.belongsTo(Role, { ...semConstraint, foreignKey: "roleId", as: "role" });
Invitation.belongsTo(User, { ...semConstraint, foreignKey: "invitedBy", as: "inviter" });

Subscription.belongsTo(Plan, { ...semConstraint, foreignKey: "planId", as: "plan" });
Subscription.belongsTo(Organization, { ...semConstraint, foreignKey: "organizationId", as: "organization" });
Organization.hasMany(Subscription, { ...semConstraint, foreignKey: "organizationId", as: "subscriptions" });
SubscriptionPayment.belongsTo(Subscription, { ...semConstraint, foreignKey: "subscriptionId", as: "subscription" });

Organization.hasOne(OrganizationWhatsapp, { ...semConstraint, foreignKey: "organizationId", as: "whatsapp" });
OrganizationWhatsapp.belongsTo(Organization, { ...semConstraint, foreignKey: "organizationId", as: "organization" });

WhatsappConversation.hasMany(WhatsappMessage, { ...semConstraint, foreignKey: "conversationId", as: "messages" });
WhatsappMessage.belongsTo(WhatsappConversation, { ...semConstraint, foreignKey: "conversationId", as: "conversation" });
WhatsappConversation.belongsTo(Person, { ...semConstraint, foreignKey: "personId", as: "person" });

WhatsappBroadcast.hasMany(WhatsappBroadcastRecipient, { ...semConstraint, foreignKey: "broadcastId", as: "recipients" });
WhatsappBroadcastRecipient.belongsTo(WhatsappBroadcast, { ...semConstraint, foreignKey: "broadcastId", as: "broadcast" });
WhatsappBroadcastRecipient.belongsTo(Person, { ...semConstraint, foreignKey: "personId", as: "person" });
