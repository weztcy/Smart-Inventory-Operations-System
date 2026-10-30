import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import {
  createReceipt, createIssue, createTransfer, createAdjustment, createOpeningStock,
  listTransactions,
} from "@/lib/services/transactions";

const lineSchema = z.object({
  itemId: z.string().min(1),
  locationId: z.string().min(1),
  quantity: z.string().min(1, "Kuantitas wajib diisi"),
  uomId: z.string().optional(),
  unitCost: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const bodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("receipt"),
    mode: z.enum(["draft", "post"]),
    supplierId: z.string().nullable().optional(),
    reference: z.string().nullable().optional(),
    date: z.string().optional(),
    notes: z.string().nullable().optional(),
    lines: z.array(lineSchema).min(1, "Minimal satu baris item"),
  }),
  z.object({
    kind: z.literal("issue"),
    mode: z.enum(["draft", "post"]),
    issueType: z.string().min(1),
    destination: z.string().nullable().optional(),
    reference: z.string().nullable().optional(),
    date: z.string().optional(),
    notes: z.string().nullable().optional(),
    lines: z.array(lineSchema).min(1, "Minimal satu baris item"),
  }),
  z.object({
    kind: z.literal("transfer"),
    mode: z.enum(["draft", "post"]),
    date: z.string().optional(),
    notes: z.string().nullable().optional(),
    lines: z.array(lineSchema.extend({ toLocationId: z.string().min(1) }))
      .min(1, "Minimal satu baris item"),
  }),
  z.object({
    kind: z.literal("adjustment"),
    mode: z.enum(["draft", "post"]),
    reason: z.string().min(3, "Alasan penyesuaian wajib diisi"),
    date: z.string().optional(),
    notes: z.string().nullable().optional(),
    lines: z.array(z.object({
      itemId: z.string().min(1),
      locationId: z.string().min(1),
      newQty: z.string().min(1),
    })).min(1, "Minimal satu baris item"),
  }),
  z.object({
    kind: z.literal("opening"),
    date: z.string().optional(),
    reference: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    lines: z.array(lineSchema).min(1, "Minimal satu baris item"),
  }),
]);

export const GET = apiRoute(async (req) => {
  const ctx = await requirePermission("tx.view");
  const sp = req.nextUrl.searchParams;
  const result = await listTransactions(ctx.org.id, {
    type: sp.get("type") ?? undefined,
    status: sp.get("status") ?? undefined,
    q: sp.get("q") ?? undefined,
    page: sp.get("page") ? Number(sp.get("page")) : 1,
  });
  return ok(result);
});

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("tx.create");
  assertOrgOperational(ctx);
  const body = await parseBody(req, bodySchema);
  const idempotencyKey = req.headers.get("idempotency-key");

  switch (body.kind) {
    case "receipt": {
      const r = await createReceipt(ctx, body, body.mode);
      return ok(r, 201);
    }
    case "issue": {
      const r = await createIssue(ctx, body, body.mode);
      return ok(r, 201);
    }
    case "transfer": {
      const r = await createTransfer(ctx, body, body.mode);
      return ok(r, 201);
    }
    case "adjustment": {
      const r = await createAdjustment(ctx, body, body.mode);
      return ok(r, 201);
    }
    case "opening": {
      const r = await createOpeningStock(ctx, body);
      return ok(r, 201);
    }
  }
});
