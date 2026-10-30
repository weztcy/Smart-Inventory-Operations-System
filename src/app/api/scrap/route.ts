import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { createScrapRecord, listScrapRecords } from "@/lib/services/scrap";

const scrapSchema = z.object({
  productionOrderId: z.string().nullable().optional(),
  sourceItemId: z.string().min(1, "Material sumber wajib dipilih"),
  sourceLocationId: z.string().min(1),
  scrapItemId: z.string().min(1, "Item scrap wajib dipilih"),
  scrapQty: z.string().min(1, "Kuantitas scrap wajib diisi"),
  category: z.string().min(1),
  destinationLocationId: z.string().nullable().optional(),
  scrapDate: z.string().optional(),
  cause: z.string().nullable().optional(),
  estimatedValue: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const GET = apiRoute(async (req) => {
  const ctx = await requirePermission("scrap.view");
  const sp = req.nextUrl.searchParams;
  const records = await listScrapRecords(ctx.org.id, {
    category: sp.get("category") ?? undefined,
    status: sp.get("status") ?? undefined,
  });
  return ok({ records });
});

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("scrap.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, scrapSchema);
  const result = await createScrapRecord(ctx, body);
  return ok(result, 201);
});
