import { apiRoute, ok } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { revokeInvitation } from "@/lib/services/org";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiRoute<Ctx>(async (_req, { params }) => {
  const ctx = await requirePermission("member.manage");
  const { id } = await params;
  await revokeInvitation(ctx, id);
  return ok({ ok: true });
});

