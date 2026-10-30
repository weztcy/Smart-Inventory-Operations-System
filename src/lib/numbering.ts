import type { Db } from "@/lib/db";

/** Penomoran dokumen per organisasi: PREFIX-TAHUN-NOMOR (RCV-2026-000001).
 *  Harus dipanggil di dalam transaksi agar unik. */
export async function nextDocNumber(
  db: Db,
  orgId: string,
  prefix: string,
  date = new Date(),
): Promise<string> {
  const year = date.getFullYear();
  const key = `${prefix}-${year}`;
  const counter = await db.docCounter.upsert({
    where: { organizationId_key: { organizationId: orgId, key } },
    create: { organizationId: orgId, key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${year}-${String(counter.value).padStart(6, "0")}`;
}
