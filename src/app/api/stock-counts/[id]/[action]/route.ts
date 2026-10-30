import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { saveCounts, reconcileStockCount, cancelStockCount } from "@/lib/services/opname";

type Ctx = { params: Promise<{ id: string; action: string }> };

export const POST = apiRoute<Ctx>(async (req, { params }) => {
  const { id, action } = await params;

  switch (action) {
    case "save": {
      const ctx = await requirePermission("opname.manage");
      assertOrgOperational(ctx);
      const body = await parseBody(req, z.object({
        lines: z.array(z.object({
          lineId: z.string().min(1),
          countedQty: z.string().nullable(),
        })).min(1),
      }));
      await saveCounts(ctx, id, body.lines);
      return ok({ ok: true });
    }
    case "reconcile": {
      const ctx = await requirePermission("opname.manage");
      assertOrgOperational(ctx);
      return ok(await reconcileStockCount(ctx, id));
    }
    case "cancel": {
      const ctx = await requirePermission("opname.manage");
      assertOrgOperational(ctx);
      await cancelStockCount(ctx, id);
      return ok({ ok: true });
    }
    default:
      return ok({ error: "Aksi tidak dikenal" }, 404);
  }
});

