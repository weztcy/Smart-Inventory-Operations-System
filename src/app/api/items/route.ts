import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { createItem, listItems } from "@/lib/services/items";

const lineSchema = z.object({
  code: z.string().min(1, "SKU wajib diisi"),
  name: z.string().min(1, "Nama item wajib diisi"),
  type: z.string().min(1),
  baseUomId: z.string().min(1, "Satuan dasar wajib dipilih"),
  categoryId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  minStock: z.string().nullable().optional(),
  reorderQty: z.string().nullable().optional(),
  defaultCost: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const GET = apiRoute(async (req) => {
  const ctx = await requirePermission("item.view");
  const sp = req.nextUrl.searchParams;
  const items = await listItems(ctx.org.id, {
    q: sp.get("q") ?? undefined,
    type: sp.get("type") ?? undefined,
    categoryId: sp.get("categoryId") ?? undefined,
    active: sp.get("active") ?? undefined,
  });
  return ok({ items });
});

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("item.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, lineSchema);
  const item = await createItem(ctx, body);
  return ok({ item }, 201);
});
