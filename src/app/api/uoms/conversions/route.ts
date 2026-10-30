import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { createUomConversion } from "@/lib/services/master";

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("master.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, z.object({
    fromUomId: z.string().min(1),
    toUomId: z.string().min(1),
    factor: z.string().min(1, "Faktor konversi wajib diisi"),
  }));
  const conv = await createUomConversion(ctx, body.fromUomId, body.toUomId, body.factor);
  return ok({ conv }, 201);
});
