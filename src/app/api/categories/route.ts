import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { createCategory } from "@/lib/services/master";

export const GET = apiRoute(async () => {
  const ctx = await requirePermission("item.view");
  const categories = await prisma.itemCategory.findMany({
    where: { organizationId: ctx.org.id },
    include: { _count: { select: { items: true } } },
    orderBy: { name: "asc" },
  });
  return ok({ categories });
});

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("master.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, z.object({
    name: z.string().min(1, "Nama kategori wajib diisi"),
    description: z.string().optional(),
  }));
  const category = await createCategory(ctx, body.name, body.description);
  return ok({ category }, 201);
});
