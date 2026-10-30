// Autentikasi sesi berbasis JWT (jose) dalam cookie httpOnly.
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { unauthorized, forbidden } from "@/lib/errors";
import { roleHas, type Permission, type Role } from "@/lib/constants";
import { BLOCKING_SUBSCRIPTION_STATUSES } from "@/lib/constants";

const COOKIE_NAME = "sio_session";
const SESSION_DAYS = 7;

function secretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET belum diatur atau terlalu pendek (min 16 karakter).");
  }
  return new TextEncoder().encode(s);
}

export interface SessionToken {
  uid: string;
  org: string | null;
}

export async function signSessionToken(payload: SessionToken): Promise<string> {
  return new SignJWT({ uid: payload.uid, org: payload.org })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionToken | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.uid !== "string") return null;
    return { uid: payload.uid, org: (payload.org as string | null) ?? null };
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionToken) {
  const token = await signSessionToken(payload);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSessionToken(): Promise<SessionToken | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Konteks sesi lengkap: user + organisasi aktif + role + langganan. */
export interface SessionContext {
  user: { id: string; name: string; email: string };
  org: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    status: string;
    isDemo: boolean;
    planCode: string | null;
    planName: string | null;
    maxItems: number | null;
    maxUsers: number | null;
    maxWarehouses: number | null;
    subscriptionStatus: string | null;
  };
  role: Role;
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const token = await getSessionToken();
  if (!token?.org) return null;

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: token.uid, organizationId: token.org } },
    include: {
      user: true,
      organization: { include: { subscription: { include: { plan: true } } } },
    },
  });
  if (!membership || !membership.isActive || !membership.user.isActive) return null;

  const sub = membership.organization.subscription;
  return {
    user: {
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
    },
    org: {
      id: membership.organization.id,
      name: membership.organization.name,
      currency: membership.organization.currency,
      timezone: membership.organization.timezone,
      status: membership.organization.status,
      isDemo: membership.organization.isDemo,
      planCode: sub?.plan.code ?? null,
      planName: sub?.plan.name ?? null,
      maxItems: sub?.plan.maxItems ?? null,
      maxUsers: sub?.plan.maxUsers ?? null,
      maxWarehouses: sub?.plan.maxWarehouses ?? null,
      subscriptionStatus: sub?.status ?? null,
    },
    role: membership.role as Role,
  };
}

export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw unauthorized();
  return ctx;
}

export async function requirePermission(permission: Permission): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!roleHas(ctx.role, permission)) {
    throw forbidden(`Peran Anda (${ctx.role}) tidak memiliki izin "${permission}".`);
  }
  return ctx;
}

/** Organisasi harus aktif dan langganan tidak memblokir operasi (PRD §19.5). */
export function assertOrgOperational(ctx: SessionContext) {
  if (ctx.org.status === "SUSPENDED") {
    throw forbidden("Organisasi ditangguhkan. Transaksi baru tidak diizinkan; hubungi pemilik akun.");
  }
  if (
    ctx.org.subscriptionStatus &&
    BLOCKING_SUBSCRIPTION_STATUSES.includes(ctx.org.subscriptionStatus as never)
  ) {
    throw forbidden(
      "Langganan organisasi tidak aktif. Transaksi baru diblokir; data tetap dapat dilihat dan diekspor oleh pemilik akun.",
    );
  }
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Rate limiter sederhana in-memory untuk endpoint sensitif (login). */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 5, windowMs = 60_000): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > limit) {
    const seconds = Math.ceil((entry.resetAt - now) / 1000);
    throw forbidden(`Terlalu banyak percobaan. Coba lagi dalam ${seconds} detik.`);
  }
}
