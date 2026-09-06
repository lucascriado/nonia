import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from "sequelize";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

export class Person extends Model<InferAttributes<Person>, InferCreationAttributes<Person>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare fullName: string;
  declare email: string;
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
  email: { type: DataTypes.STRING(254), allowNull: false },
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
}

Ministry.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  name: { type: DataTypes.STRING(80), allowNull: false },
  color: { type: DataTypes.STRING(20), allowNull: false },
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
  declare isNew: boolean;
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
  isNew: { type: DataTypes.BOOLEAN, allowNull: false, field: "is_new" },
  cellName: { type: DataTypes.STRING(120), allowNull: false, field: "cell_name", defaultValue: "Sem célula" },
}, { sequelize: db, tableName: "members", createdAt: "created_at", updatedAt: "updated_at" });

export class Visitor extends Model<InferAttributes<Visitor>, InferCreationAttributes<Visitor>> {
  declare personId: string;
  declare organizationId: string;
  declare visitDate: CreationOptional<string>;
  declare invitedBy: string;
  declare followUpStatus: string;
  declare membershipStage: string;
  declare isRecent: boolean;
}

Visitor.init({
  personId: { type: DataTypes.UUID, primaryKey: true, field: "person_id" },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: "organization_id" },
  visitDate: { type: DataTypes.DATEONLY, field: "visit_date" },
  invitedBy: { type: DataTypes.STRING(160), allowNull: false, field: "invited_by" },
  followUpStatus: { type: DataTypes.STRING(30), allowNull: false, field: "follow_up_status" },
  membershipStage: { type: DataTypes.STRING(30), allowNull: false, field: "membership_stage" },
  isRecent: { type: DataTypes.BOOLEAN, allowNull: false, field: "is_recent" },
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
  transactionDate: { type: DataTypes.DATEONLY, allowNull: false, field: "transaction_date", defaultValue: () => new Date().toISOString().slice(0, 10) },
  paymentMethod: { type: DataTypes.STRING(40), field: "payment_method" },
  attachmentUrl: { type: DataTypes.TEXT, field: "attachment_url" },
  attachmentName: { type: DataTypes.STRING(160), field: "attachment_name" },
  notes: DataTypes.TEXT,
}, { sequelize: db, tableName: "financial_transactions", createdAt: "created_at", updatedAt: "updated_at" });

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
}, { sequelize: db, tableName: "subscription_payments", createdAt: "created_at", updatedAt: "updated_at" });
