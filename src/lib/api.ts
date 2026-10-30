// Wrapper route handler Next.js: parsing JSON + zod, pemetaan error, dan helper respons.
import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError } from "@/lib/errors";

type RouteCtx = { params?: Promise<Record<string, string>> };

export function apiRoute<Ctx extends RouteCtx>(
  fn: (req: NextRequest, ctx: Ctx) => Promise<NextResponse | Response>,
) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message, code: err.code ?? null }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const msg = err.issues
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ");
    return NextResponse.json({ error: `Data tidak valid — ${msg}` }, { status: 400 });
  }
  console.error("[api] unhandled error:", err);
  return NextResponse.json(
    { error: "Terjadi kesalahan internal. Tim kami telah mencatat kejadian ini." },
    { status: 500 },
  );
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError(400, "Body request harus berupa JSON yang valid.");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const obj: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    obj[k] = v;
  });
  return schema.parse(obj);
}

export function ok(data?: unknown, status = 200): Response {
  return NextResponse.json(data ?? { ok: true }, { status });
}
