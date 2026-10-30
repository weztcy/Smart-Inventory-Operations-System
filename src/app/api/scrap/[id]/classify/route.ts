import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { classifyScrap } from "@/lib/services/scrap";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiRoute<Ctx>(async (req, { params }) => {
  const ctx = await requirePermission("scrap.manage");
  assertOrgOperational(ctx);
  const { id } = await params;
  const body = await parseBody(req, z.object({ category: z.string().min(1) }));
  const record = await classifyScrap(ctx, id, body.category);
  return ok({ record });
});

