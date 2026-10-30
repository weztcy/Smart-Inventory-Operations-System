import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { postTx } from "@/lib/services/transactions";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiRoute<Ctx>(async (_req, { params }) => {
  const ctx = await requirePermission("tx.post");
  assertOrgOperational(ctx);
  const { id } = await params;
  const result = await postTx(ctx, id);
  return ok(result);
});

