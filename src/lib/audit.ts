import type { Db } from "@/lib/db";

function serialize(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  try {
    const s = JSON.stringify(v, (_k, val) =>
      typeof val === "bigint" ? val.toString() : val,
    );
    return s && s.length > 4000 ? s.slice(0, 4000) : s;
  } catch {
    return "[tidak dapat diserialisasi]";
  }
}

/** Catat audit trail (PRD §18). Tidak pernah menyimpan password/token. */
export async function logAudit(
  db: Db,
  data: {
    orgId?: string | null;
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: data.orgId ?? null,
      userId: data.userId ?? null,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId ?? null,
      before: serialize(data.before),
      after: serialize(data.after),
      reason: data.reason ?? null,
    },
  });
}
