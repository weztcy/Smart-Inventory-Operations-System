import { apiRoute, ok } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { archiveBOM } from "@/lib/services/production";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = apiRoute<Ctx>(async (_req, { params }) => {
  const ctx = await requirePermission("bom.manage");
  assertOrgOperational(ctx);
  const { id } = await params;
  await archiveBOM(ctx, id);
  return ok({ ok: true });
});

