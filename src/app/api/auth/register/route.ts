import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth";
import { registerOrganization, seedPlansIfMissing } from "@/lib/services/org";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  email: z.string().email("Email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter"),
  orgName: z.string().min(2, "Nama organisasi minimal 2 karakter"),
  businessType: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
});

export const POST = apiRoute(async (req) => {
  const body = await parseBody(req, schema);
  await seedPlansIfMissing();
  const { userId, orgId } = await registerOrganization(body);
  await setSessionCookie({ uid: userId, org: orgId });
  return ok({ ok: true }, 201);
});
