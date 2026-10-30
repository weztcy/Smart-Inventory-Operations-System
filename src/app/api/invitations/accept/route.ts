import { z } from "zod";
import { apiRoute, ok, parseBody } from "@/lib/api";
import { getSessionToken, setSessionCookie } from "@/lib/auth";
import { acceptInvitation } from "@/lib/services/org";

const schema = z.object({
  token: z.string().min(10),
  name: z.string().optional(),
  password: z.string().optional(),
});

export const POST = apiRoute(async (req) => {
  const body = await parseBody(req, schema);
  const session = await getSessionToken();
  const result = await acceptInvitation(
    body.token,
    session?.uid ?? null,
    body.name && body.password ? { name: body.name, password: body.password } : undefined,
  );
  await setSessionCookie({ uid: result.userId, org: result.organizationId });
  return ok({ ok: true });
});
