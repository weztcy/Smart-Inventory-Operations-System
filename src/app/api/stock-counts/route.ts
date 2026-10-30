import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { createStockCount, listStockCounts } from "@/lib/services/opname";

const countSchema = z.object({
  warehouseId: z.string().min(1, "Gudang wajib dipilih"),
  locationId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const GET = apiRoute(async () => {
  const ctx = await requirePermission("tx.view");
  const counts = await listStockCounts(ctx.org.id);
  return ok({ counts });
});

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("opname.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, countSchema);
  const count = await createStockCount(ctx, body);
  return ok({ count }, 201);
});
