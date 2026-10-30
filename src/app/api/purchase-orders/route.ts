import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { createPurchaseOrder, listPurchaseOrders } from "@/lib/services/purchase";

const poSchema = z.object({
  supplierId: z.string().min(1, "Supplier wajib dipilih"),
  orderDate: z.string().optional(),
  expectedDate: z.string().nullable().optional(),
  destinationWarehouseId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  submit: z.boolean().default(false),
  lines: z.array(z.object({
    itemId: z.string().min(1),
    orderedQty: z.string().min(1),
    unitPrice: z.string().min(1),
    notes: z.string().nullable().optional(),
  })).min(1, "Minimal satu baris item"),
});

export const GET = apiRoute(async (req) => {
  const ctx = await requirePermission("po.view");
  const sp = req.nextUrl.searchParams;
  const result = await listPurchaseOrders(ctx.org.id, {
    status: sp.get("status") ?? undefined,
    page: sp.get("page") ? Number(sp.get("page")) : 1,
  });
  return ok(result);
});

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("po.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, poSchema);
  const po = await createPurchaseOrder(ctx, body);
  return ok({ po }, 201);
});
