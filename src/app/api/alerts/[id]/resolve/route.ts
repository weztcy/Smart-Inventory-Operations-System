import { apiRoute, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiRoute<Ctx>(async (_req, { params }) => {
  const ctx = await requirePermission("tx.view");
  assertOrgOperational(ctx);
  const { id } = await params;
  const alert = await prisma.alert.findFirst({
    where: { id, organizationId: ctx.org.id, status: "ACTIVE" },
  });
  if (!alert) throw notFound("Alert tidak ditemukan atau sudah selesai.");
  const updated = await prisma.alert.update({
    where: { id: alert.id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "ALERT_RESOLVE", entityType: "Alert", entityId: alert.id,
  });
  return ok({ alert: updated });
});

