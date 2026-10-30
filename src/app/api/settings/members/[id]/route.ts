import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { updateMemberRole, setMemberActive } from "@/lib/services/org";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = apiRoute<Ctx>(async (req, { params }) => {
  const ctx = await requirePermission("member.manage");
  const { id } = await params;
  const body = await parseBody(req, z.object({
    role: z.string().optional(),
    isActive: z.boolean().optional(),
  }));
  if (body.role) {
    return ok({ member: await updateMemberRole(ctx, id, body.role) });
  }
  if (body.isActive !== undefined) {
    return ok({ member: await setMemberActive(ctx, id, body.isActive) });
  }
  return ok({ error: "Tidak ada perubahan" }, 400);
});

