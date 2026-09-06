import { QueryTypes, type Transaction } from "sequelize";
import { db } from "@/lib/db";

/** "Igreja Batista Central" -> "igreja-batista-central" */
export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Slug livre a partir do nome, com sufixo numérico em caso de colisão. */
export async function uniqueOrganizationSlug(desired: string, transaction?: Transaction) {
  const base = slugify(desired) || "igreja";

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const rows = await db.query<{ id: string }>(`SELECT id FROM organizations WHERE slug = $1`, {
      bind: [candidate],
      transaction,
      type: QueryTypes.SELECT,
    });
    if (!rows.length) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (value: string) => value.trim().toLowerCase();
