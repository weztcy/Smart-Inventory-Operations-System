import { apiRoute, ok } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { cancelTx } from "@/lib/services/transactions";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiRoute<Ctx>(async (_req, { params }) => {
  const ctx = await requirePermission("tx.create");
  assertOrgOperational(ctx);
  const { id } = await params;
  const result = await cancelTx(ctx, id);
  return ok(result);
});

