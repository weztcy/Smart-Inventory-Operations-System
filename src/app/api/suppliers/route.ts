import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { createSupplier } from "@/lib/services/master";

const partnerSchema = z.object({
  code: z.string().min(1, "Kode wajib diisi"),
  name: z.string().min(1, "Nama wajib diisi"),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  taxId: z.string().optional(),
  notes: z.string().optional(),
});

export const GET = apiRoute(async () => {
  const ctx = await requirePermission("po.view");
  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: ctx.org.id },
    orderBy: { code: "asc" },
  });
  return ok({ suppliers });
});

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("master.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, partnerSchema);
  const supplier = await createSupplier(ctx, body);
  return ok({ supplier }, 201);
});
