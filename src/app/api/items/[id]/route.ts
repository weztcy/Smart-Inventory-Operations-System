import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { updateItem, setItemActive, deleteItemIfUnused } from "@/lib/services/items";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  baseUomId: z.string().optional(),
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

export const PUT = apiRoute<Ctx>(async (req, { params }) => {
  const ctx = await requirePermission("item.manage");
  assertOrgOperational(ctx);
  const { id } = await params;
  const body = await parseBody(req, updateSchema);
  const item = await updateItem(ctx, id, body);
  return ok({ item });
});

export const PATCH = apiRoute<Ctx>(async (req, { params }) => {
  const ctx = await requirePermission("item.manage");
  assertOrgOperational(ctx);
  const { id } = await params;
  const body = await parseBody(req, z.object({ isActive: z.boolean() }));
  const item = await setItemActive(ctx, id, body.isActive);
  return ok({ item });
});

export const DELETE = apiRoute<Ctx>(async (_req, { params }) => {
  const ctx = await requirePermission("item.manage");
  assertOrgOperational(ctx);
  const { id } = await params;
  await deleteItemIfUnused(ctx, id);
  return ok({ ok: true });
});

