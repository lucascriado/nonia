import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from "sequelize";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

export class Person extends Model<InferAttributes<Person>, InferCreationAttributes<Person>> {
  declare id: CreationOptional<string>;
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
  declare name: string;
  declare color: string;
}

Ministry.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  name: { type: DataTypes.STRING(80), allowNull: false },
  color: { type: DataTypes.STRING(20), allowNull: false },
}, { sequelize: db, tableName: "ministries", createdAt: "created_at", updatedAt: "updated_at" });

export class Member extends Model<InferAttributes<Member>, InferCreationAttributes<Member>> {
  declare personId: string;
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
  declare visitDate: CreationOptional<string>;
  declare invitedBy: string;
  declare followUpStatus: string;
  declare membershipStage: string;
  declare isRecent: boolean;
}

Visitor.init({
  personId: { type: DataTypes.UUID, primaryKey: true, field: "person_id" },
  visitDate: { type: DataTypes.DATEONLY, field: "visit_date" },
  invitedBy: { type: DataTypes.STRING(160), allowNull: false, field: "invited_by" },
  followUpStatus: { type: DataTypes.STRING(30), allowNull: false, field: "follow_up_status" },
  membershipStage: { type: DataTypes.STRING(30), allowNull: false, field: "membership_stage" },
  isRecent: { type: DataTypes.BOOLEAN, allowNull: false, field: "is_recent" },
}, { sequelize: db, tableName: "visitors", createdAt: "created_at", updatedAt: "updated_at" });

export class Activity extends Model<InferAttributes<Activity>, InferCreationAttributes<Activity>> {
  declare id: CreationOptional<string>;
  declare category: string;
  declare actor: string;
  declare action: string;
  declare subject: string | null;
  declare details: string | null;
  declare occurredAt: CreationOptional<Date>;
}

Activity.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => randomUUID() },
  category: { type: DataTypes.STRING(30), allowNull: false },
  actor: { type: DataTypes.STRING(120), allowNull: false },
  action: { type: DataTypes.STRING(200), allowNull: false },
  subject: DataTypes.STRING(160),
  details: DataTypes.TEXT,
  occurredAt: { type: DataTypes.DATE, allowNull: false, field: "occurred_at" },
}, { sequelize: db, tableName: "activities", createdAt: "created_at", updatedAt: false });

export class FinancialTransaction extends Model<InferAttributes<FinancialTransaction>, InferCreationAttributes<FinancialTransaction>> {
  declare id: CreationOptional<string>;
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
