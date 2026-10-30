import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { changePlan } from "@/lib/services/org";

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("billing.manage");
  const body = await parseBody(req, z.object({ planCode: z.string().min(1) }));
  const sub = await changePlan(ctx, body.planCode);
  return ok({ subscription: sub });
});
