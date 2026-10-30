import { apiRoute, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSessionContext, getSessionToken } from "@/lib/auth";

export const GET = apiRoute(async () => {
  const token = await getSessionToken();
  if (!token) return ok({ user: null, memberships: [] });
  const user = await prisma.user.findUnique({
    where: { id: token.uid },
    select: { id: true, name: true, email: true, isActive: true },
  });
  if (!user || !user.isActive) return ok({ user: null, memberships: [] });
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, isActive: true },
    include: { organization: { select: { id: true, name: true, status: true } } },
  });
  const ctx = await getSessionContext();
  return ok({ user, memberships, activeOrgId: ctx?.org.id ?? null, role: ctx?.role ?? null });
});
