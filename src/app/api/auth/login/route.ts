import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { setSessionCookie, verifyPassword, rateLimit } from "@/lib/auth";
import { unauthorized } from "@/lib/errors";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(1, "Password diperlukan"),
});

export const POST = apiRoute(async (req) => {
  const body = await parseBody(req, schema);
  const email = body.email.toLowerCase().trim();
  rateLimit(`login:${email}`);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !(await verifyPassword(body.password, user.passwordHash))) {
    throw unauthorized("Email atau password salah.");
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  await setSessionCookie({ uid: user.id, org: membership?.organizationId ?? null });
  await logAudit(prisma, {
    orgId: membership?.organizationId ?? null,
    userId: user.id,
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
  });
  return ok({ ok: true });
});
