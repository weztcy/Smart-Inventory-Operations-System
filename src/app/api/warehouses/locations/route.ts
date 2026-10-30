import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { createLocation } from "@/lib/services/master";

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("master.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, z.object({
    warehouseId: z.string().min(1),
    code: z.string().min(1, "Kode lokasi wajib diisi"),
    name: z.string().min(1, "Nama lokasi wajib diisi"),
    type: z.string().min(1),
  }));
  const loc = await createLocation(ctx, body.warehouseId, body.code, body.name, body.type);
  return ok({ location: loc }, 201);
});
