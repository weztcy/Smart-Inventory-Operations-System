import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { createUom } from "@/lib/services/master";

export const GET = apiRoute(async () => {
  const ctx = await requirePermission("item.view");
  const uoms = await prisma.unitOfMeasure.findMany({
    where: { organizationId: ctx.org.id },
    include: {
      conversionsFrom: { include: { toUom: true } },
      conversionsTo: { include: { fromUom: true } },
    },
    orderBy: { code: "asc" },
  });
  return ok({ uoms });
});

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("master.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, z.object({
    code: z.string().min(1, "Kode satuan wajib diisi"),
    name: z.string().min(1, "Nama satuan wajib diisi"),
  }));
  const uom = await createUom(ctx, body.code, body.name);
  return ok({ uom }, 201);
});
