import type { Transaction } from "sequelize";
import { db } from "@/lib/db";

export type ActivityCategory = "members" | "visitors" | "calendar" | "system" | "financial";

/** Só o que o log precisa da sessão -- `AuthContext` atende estruturalmente. */
export type ActivityActor = {
  user: { id: string; fullName: string };
  organization: { id: string };
};

export async function addActivity(
  transaction: Transaction,
  actor: ActivityActor,
  category: ActivityCategory,
  action: string,
  subject?: string | null,
  details?: string | null,
) {
  await db.query(
    `INSERT INTO activities (organization_id, actor_user_id, category, actor, action, subject, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    {
      bind: [
        actor.organization.id,
        actor.user.id,
        category,
        actor.user.fullName,
        action,
        subject ?? null,
        details ?? null,
      ],
      transaction,
    },
  );
}
