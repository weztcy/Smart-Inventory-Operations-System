import { apiRoute, ok } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { deleteCategory } from "@/lib/services/master";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = apiRoute<Ctx>(async (_req, { params }) => {
  const ctx = await requirePermission("master.manage");
  assertOrgOperational(ctx);
  const { id } = await params;
  await deleteCategory(ctx, id);
  return ok({ ok: true });
});

