import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import {
  approvePO, submitPO, cancelPO, receivePurchaseOrder,
} from "@/lib/services/purchase";

type Ctx = { params: Promise<{ id: string; action: string }> };

const receiveSchema = z.object({
  locationId: z.string().min(1, "Lokasi tujuan wajib dipilih"),
  date: z.string().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(z.object({
    poLineId: z.string().min(1),
    receivedQty: z.string(),
    unitCost: z.string().nullable().optional(),
  })).min(1),
});

export const POST = apiRoute<Ctx>(async (req, { params }) => {
  const { id, action } = await params;

  switch (action) {
    case "submit": {
      const ctx = await requirePermission("po.manage");
      assertOrgOperational(ctx);
      return ok(await submitPO(ctx, id));
    }
    case "approve": {
      const ctx = await requirePermission("tx.approve");
      assertOrgOperational(ctx);
      return ok(await approvePO(ctx, id));
    }
    case "cancel": {
      const ctx = await requirePermission("po.manage");
      assertOrgOperational(ctx);
      return ok(await cancelPO(ctx, id));
    }
    case "receive": {
      const ctx = await requirePermission("tx.post");
      assertOrgOperational(ctx);
      const body = await parseBody(req, receiveSchema);
      const result = await receivePurchaseOrder(ctx, id, body);
      return ok(result, 201);
    }
    default:
      return ok({ error: "Aksi tidak dikenal" }, 404);
  }
});

