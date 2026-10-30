"use client";

// Helper fetch untuk komponen client: JSON + error terformat + anti double-submit ringan.
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.body ? { "Idempotency-Key": crypto.randomUUID() } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Permintaan gagal (${res.status})`);
  }
  return data as T;
}
