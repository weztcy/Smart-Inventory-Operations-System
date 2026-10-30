import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { createProductionOrder, listProductionOrders } from "@/lib/services/production";

const moSchema = z.object({
  itemId: z.string().min(1, "Produk wajib dipilih"),
  bomId: z.string().min(1, "BOM wajib dipilih"),
  plannedQty: z.string().min(1, "Kuantitas rencana wajib diisi"),
  plannedStartDate: z.string().nullable().optional(),
  plannedEndDate: z.string().nullable().optional(),
  sourceWarehouseId: z.string().min(1, "Gudang sumber wajib dipilih"),
  destinationWarehouseId: z.string().nullable().optional(),
  assignedTo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const GET = apiRoute(async (req) => {
  const ctx = await requirePermission("production.view");
  const sp = req.nextUrl.searchParams;
  const mos = await listProductionOrders(ctx.org.id, {
    status: sp.get("status") ?? undefined,
  });
  return ok({ mos });
});

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("production.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, moSchema);
  const mo = await createProductionOrder(ctx, body);
  return ok({ mo }, 201);
});
