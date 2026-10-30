import { apiRoute, ok } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth";

export const POST = apiRoute(async () => {
  await clearSessionCookie();
  return ok({ ok: true });
});
