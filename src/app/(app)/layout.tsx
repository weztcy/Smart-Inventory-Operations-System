import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const memberships = await prisma.membership.findMany({
    where: { userId: ctx.user.id, isActive: true },
    select: { organizationId: true, organization: { select: { name: true } } },
  });

  return (
    <AppShell
      user={{ name: ctx.user.name, email: ctx.user.email, role: ctx.role }}
      org={{ id: ctx.org.id, name: ctx.org.name, planName: ctx.org.planName }}
      memberships={memberships.map((m) => ({ orgId: m.organizationId, orgName: m.organization.name }))}
    >
      {children}
    </AppShell>
  );
}
