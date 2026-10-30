import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { createBOM, listBOMs } from "@/lib/services/production";

const bomSchema = z.object({
  itemId: z.string().min(1, "Produk jadi wajib dipilih"),
  outputQty: z.string().min(1, "Kuantitas output wajib diisi"),
  notes: z.string().nullable().optional(),
  components: z.array(z.object({
    componentItemId: z.string().min(1),
    quantity: z.string().min(1),
    scrapPercent: z.string().optional(),
  })).min(1, "BOM minimal memiliki satu komponen"),
});

export const GET = apiRoute(async () => {
  const ctx = await requirePermission("bom.view");
  const boms = await listBOMs(ctx.org.id);
  return ok({ boms });
});

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("bom.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, bomSchema);
  const bom = await createBOM(ctx, body);
  return ok({ bom }, 201);
});
