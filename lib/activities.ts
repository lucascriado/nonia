import type { Transaction } from "sequelize";
import { Activity } from "@/lib/models";

export type ActivityCategory = "members" | "visitors" | "calendar" | "system" | "financial" | "whatsapp";

/** Só o que o log precisa da sessão -- `AuthContext` atende estruturalmente. */
export type ActivityActor = {
  user: { id: string; fullName: string };
  organization: { id: string };
};

/**
 * Grava a atividade DENTRO da transação de quem chama: se a escrita que ela
 * descreve for desfeita, o registro vai junto, e vice-versa.
 */
export async function addActivity(
  transaction: Transaction,
  actor: ActivityActor,
  category: ActivityCategory,
  action: string,
  subject?: string | null,
  details?: string | null,
) {
  await Activity.create(
    {
      organizationId: actor.organization.id,
      actorUserId: actor.user.id,
      category,
      actor: actor.user.fullName,
      action,
      subject: subject ?? null,
      details: details ?? null,
      // Era o DEFAULT now() da coluna. O Model não tem default para ela, e o
      // validador de NOT NULL do Sequelize recusaria a criação sem o campo.
      occurredAt: new Date(),
    },
    { transaction },
  );
}
