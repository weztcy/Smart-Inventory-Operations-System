import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission, assertOrgOperational } from "@/lib/auth";
import { inviteMember, listMembers, listInvitations } from "@/lib/services/org";

export const GET = apiRoute(async () => {
  const ctx = await requirePermission("member.manage");
  const [members, invitations] = await Promise.all([
    listMembers(ctx.org.id),
    listInvitations(ctx.org.id),
  ]);
  return ok({ members, invitations });
});

export const POST = apiRoute(async (req) => {
  const ctx = await requirePermission("member.manage");
  assertOrgOperational(ctx);
  const body = await parseBody(req, z.object({
    email: z.string().email("Email tidak valid"),
    role: z.string().min(1),
  }));
  const invitation = await inviteMember(ctx, body);
  // Tautan klaim dikembalikan untuk development (tanpa SMTP).
  return ok({
    invitation,
    claimUrl: `/invite/${invitation.token}`,
  }, 201);
});
