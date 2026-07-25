import type { Transaction } from "sequelize";
import { db } from "@/lib/db";

export async function addActivity(transaction: Transaction, category: "members" | "visitors" | "calendar" | "system" | "financial", action: string, subject?: string, details?: string) {
  await db.query(`
    INSERT INTO activities (category, actor, action, subject, details)
    VALUES ($1, $2, $3, $4, $5)
  `, {
    bind: [category, "Secretaria Geral", action, subject ?? null, details ?? null],
    transaction,
  });
}
