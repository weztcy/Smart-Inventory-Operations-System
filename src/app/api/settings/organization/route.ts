import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { updateOrgSettings } from "@/lib/services/org";

const schema = z.object({
  name: z.string().min(2).optional(),
  businessType: z.string().nullable().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  contactEmail: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

export const PUT = apiRoute(async (req) => {
  const ctx = await requirePermission("settings.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, schema);
  const org = await updateOrgSettings(ctx, body);
  return ok({ org });
});
