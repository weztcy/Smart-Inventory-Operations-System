import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { createWarehouse } from "@/lib/services/master";

export const GET = apiRoute(async () => {
  const ctx = await requirePermission("item.view");
  const warehouses = await prisma.warehouse.findMany({
    where: { organizationId: ctx.org.id },
    include: { locations: true },
    orderBy: { code: "asc" },
  });
  return ok({ warehouses });
});

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("master.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, z.object({
    code: z.string().min(1, "Kode gudang wajib diisi"),
    name: z.string().min(1, "Nama gudang wajib diisi"),
    address: z.string().optional(),
    manager: z.string().optional(),
  }));
  const wh = await createWarehouse(ctx, body.code, body.name, body.address, body.manager);
  return ok({ warehouse: wh }, 201);
});
