import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSession, setSessionCookie } from "@/lib/auth";
import { forbidden } from "@/lib/errors";

const schema = z.object({ organizationId: z.string().min(1) });

export const POST = apiRoute(async (req) => {
  const session = await requireSession();
  const { organizationId } = await parseBody(req, schema);
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: session.user.id, organizationId } },
  });
  if (!membership || !membership.isActive) {
    throw forbidden("Anda bukan anggota organisasi tersebut.");
  }
  await setSessionCookie({ uid: session.user.id, org: organizationId });
  return ok({ ok: true });
});
