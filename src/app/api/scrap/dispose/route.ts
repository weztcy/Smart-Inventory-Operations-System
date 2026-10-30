import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { disposeScrap } from "@/lib/services/scrap";

const disposeSchema = z.object({
  scrapRecordId: z.string().nullable().optional(),
  itemId: z.string().min(1, "Item wajib dipilih"),
  locationId: z.string().min(1, "Lokasi wajib dipilih"),
  quantity: z.string().min(1, "Kuantitas wajib diisi"),
  method: z.string().optional(),
  reason: z.string().min(3, "Alasan pembuangan wajib diisi"),
  date: z.string().optional(),
});

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("scrap.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, disposeSchema);
  const result = await disposeScrap(ctx, body);
  return ok(result, 201);
});
