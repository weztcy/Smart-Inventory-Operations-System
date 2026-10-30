import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { reverseTx } from "@/lib/services/transactions";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiRoute<Ctx>(async (req, { params }) => {
  const ctx = await requirePermission("tx.reverse");
  assertOrgOperational(ctx);
  const { id } = await params;
  const body = await parseBody(req, z.object({ reason: z.string().optional() }).optional().default({}));
  const result = await reverseTx(ctx, id, body.reason);
  return ok(result);
});

