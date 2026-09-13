import { Sequelize } from "sequelize";
import pg from "pg";

const globalForDb = globalThis as unknown as { sequelize?: Sequelize };

function createSequelize() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não está definida.");

  return new Sequelize(connectionString, {
    dialect: "postgres",
    dialectModule: pg,
    logging: false,
    pool: {
      max: 10,
      min: 0,
      acquire: 10_000,
      idle: 30_000,
    },
  });
}

export const db = globalForDb.sequelize ?? createSequelize();

if (process.env.NODE_ENV !== "production") globalForDb.sequelize = db;

// Não há mais helper de SQL cru aqui, de propósito: toda consulta passa pelos
// Models de lib/models.ts. Ver o `serverExternalPackages` do next.config.ts
// para o motivo de o Sequelize não poder ser empacotado.
