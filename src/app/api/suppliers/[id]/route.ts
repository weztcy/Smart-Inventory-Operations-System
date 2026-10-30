import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { setSupplierActive } from "@/lib/services/master";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = apiRoute<Ctx>(async (req, { params }) => {
  const ctx = await requirePermission("master.manage");
  assertOrgOperational(ctx);
  const { id } = await params;
  const body = await parseBody(req, z.object({ isActive: z.boolean() }));
  const supplier = await setSupplierActive(ctx, id, body.isActive);
  return ok({ supplier });
});

