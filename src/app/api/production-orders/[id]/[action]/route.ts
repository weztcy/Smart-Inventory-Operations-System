import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import {
  confirmProductionOrder, startProductionOrder, cancelProductionOrder,
  recordConsumption, recordOutput, completeProductionOrder,
} from "@/lib/services/production";

type Ctx = { params: Promise<{ id: string; action: string }> };

export const POST = apiRoute<Ctx>(async (req, { params }) => {
  const { id, action } = await params;

  switch (action) {
    case "confirm": {
      const ctx = await requirePermission("production.manage");
      assertOrgOperational(ctx);
      return ok(await confirmProductionOrder(ctx, id));
    }
    case "start": {
      const ctx = await requirePermission("production.manage");
      assertOrgOperational(ctx);
      return ok(await startProductionOrder(ctx, id));
    }
    case "cancel": {
      const ctx = await requirePermission("production.manage");
      assertOrgOperational(ctx);
      return ok(await cancelProductionOrder(ctx, id));
    }
    case "consume": {
      const ctx = await requirePermission("production.manage");
      assertOrgOperational(ctx);
      const body = await parseBody(req, z.object({
        date: z.string().optional(),
        lines: z.array(z.object({
          itemId: z.string().min(1),
          sourceLocationId: z.string().min(1),
          actualQty: z.string().min(1),
          notes: z.string().nullable().optional(),
        })).min(1, "Minimal satu baris konsumsi"),
      }));
      return ok(await recordConsumption(ctx, { moId: id, ...body }), 201);
    }
    case "output": {
      const ctx = await requirePermission("production.manage");
      assertOrgOperational(ctx);
      const body = await parseBody(req, z.object({
        destinationLocationId: z.string().min(1, "Lokasi tujuan wajib dipilih"),
        actualQty: z.string().min(1, "Kuantitas wajib diisi"),
        date: z.string().optional(),
        notes: z.string().nullable().optional(),
      }));
      return ok(await recordOutput(ctx, { moId: id, ...body }), 201);
    }
    case "complete": {
      const ctx = await requirePermission("production.manage");
      assertOrgOperational(ctx);
      const body = await parseBody(req, z.object({
        confirmNoMoreConsumption: z.boolean().default(false),
      }));
      return ok(await completeProductionOrder(ctx, id, body.confirmNoMoreConsumption));
    }
    default:
      return ok({ error: "Aksi tidak dikenal" }, 404);
  }
});

