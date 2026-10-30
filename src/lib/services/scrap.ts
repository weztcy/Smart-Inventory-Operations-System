// Layanan scrap & material sisa (PRD §14).
// Desain: pencatatan scrap MEMBUAT stok scrap yang dapat dilacak melalui
// transaksi SCRAP_IN pada item scrap; disposal mengurangi stok scrap melalui
// transaksi DISPOSAL. Material konsumsi TIDAK dikurangi dua kali.
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { Decimal, toDec, sumDec } from "@/lib/decimal";
import { nextDocNumber } from "@/lib/numbering";
import {
  postTransactionWithinTx, withPostingLock, type EngineLineInput,
} from "@/lib/inventory/engine";
import { SCRAP_CATEGORIES, type ScrapCategory } from "@/lib/constants";

type Ctx = { org: { id: string }; user: { id: string } };

export interface ScrapInput {
  productionOrderId?: string | null;
  sourceItemId: string;
  sourceLocationId: string;
  scrapItemId: string;
  scrapQty: string;
  category: string;
  destinationLocationId?: string | null;
  scrapDate?: string;
  cause?: string | null;
  estimatedValue?: string | null;
  notes?: string | null;
}

/** Catat scrap: barang masuk ke lokasi scrap sebagai stok terlacak (PRD §14.4).
 *  Nilai masuk memakai estimasi nilai pulih bila diberikan, jika tidak
 *  memakai avg cost material sumber (estimasi, bukan pendapatan — §14.6). */
export async function createScrapRecord(ctx: Ctx, input: ScrapInput) {
  if (!SCRAP_CATEGORIES.includes(input.category as ScrapCategory)) {
    throw badRequest("Kategori scrap tidak valid.");
  }
  const qty = toDec(input.scrapQty);
  if (qty.lte(0)) throw badRequest("Kuantitas scrap harus lebih besar dari nol.");

  return withPostingLock(() =>
    prisma.$transaction(async (tx) => {
      const sourceItem = await tx.item.findFirst({
        where: { id: input.sourceItemId, organizationId: ctx.org.id },
      });
      if (!sourceItem) throw badRequest("Material sumber tidak ditemukan.");
      const scrapItem = await tx.item.findFirst({
        where: { id: input.scrapItemId, organizationId: ctx.org.id },
      });
      if (!scrapItem) throw badRequest("Item scrap tidak ditemukan.");
      if (scrapItem.type !== "SCRAP") {
        throw badRequest("Item scrap harus bertipe SCRAP agar terlacak terpisah dari material baru.");
      }
      let mo = null;
      if (input.productionOrderId) {
        mo = await tx.productionOrder.findFirst({
          where: { id: input.productionOrderId, organizationId: ctx.org.id },
        });
        if (!mo) throw badRequest("Production order tidak ditemukan.");
        if (!["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(mo.status)) {
          throw conflict("MO terkait belum berjalan/selesai sehingga scrap belum dapat dicatat.");
        }
      }
      const destLoc = input.destinationLocationId ?? input.sourceLocationId;
      const dest = await tx.storageLocation.findFirst({
        where: { id: destLoc, organizationId: ctx.org.id, isActive: true },
      });
      if (!dest) throw badRequest("Lokasi penyimpanan scrap tidak valid.");

      // Estimasi nilai: eksplisit > avg cost sumber
      const unitValue = input.estimatedValue
        ? toDec(input.estimatedValue).div(qty)
        : toDec(sourceItem.avgCost);

      const number = await nextDocNumber(tx, ctx.org.id, "SCR", input.scrapDate ? new Date(input.scrapDate) : undefined);
      const record = await tx.scrapRecord.create({
        data: {
          organizationId: ctx.org.id,
          number,
          productionOrderId: mo?.id ?? null,
          sourceItemId: input.sourceItemId,
          sourceLocationId: input.sourceLocationId,
          scrapItemId: input.scrapItemId,
          scrapQty: qty.toString(),
          category: input.category,
          destinationLocationId: destLoc,
          scrapDate: input.scrapDate ? new Date(input.scrapDate) : new Date(),
          cause: input.cause || null,
          estimatedValue: input.estimatedValue ? toDec(input.estimatedValue).toString() : null,
          status: "DRAFT",
          recordedById: ctx.user.id,
          notes: input.notes || null,
        },
      });

      const posted = await postTransactionWithinTx(tx, {
        orgId: ctx.org.id,
        userId: ctx.user.id,
        type: "SCRAP_IN",
        date: record.scrapDate,
        notes: `Scrap ${number} dari ${sourceItem.code}${mo ? ` / MO ${mo.number}` : ""}`,
        reason: `cause:${input.cause ?? "unspecified"}`,
        refType: "SCRAP_RECORD",
        refId: record.id,
        refNumber: number,
        lines: [{
          itemId: input.scrapItemId,
          locationId: destLoc,
          quantity: qty,
          unitCost: unitValue.gt(0) ? unitValue : null,
        }],
      });

      await tx.scrapRecord.update({
        where: { id: record.id },
        data: { status: "POSTED", transactionId: posted.id },
      });
      await logAudit(tx, {
        orgId: ctx.org.id, userId: ctx.user.id,
        action: "SCRAP_RECORD", entityType: "ScrapRecord", entityId: record.id,
        after: { number, category: input.category, qty: qty.toString(), source: sourceItem.code },
      });
      return { recordId: record.id, number, transaction: posted };
    }),
  );
}

/** Ubah klasifikasi scrap (mis. dari PENDING ke REUSABLE) — tercatat di audit. */
export async function classifyScrap(ctx: Ctx, scrapId: string, category: string) {
  if (!SCRAP_CATEGORIES.includes(category as ScrapCategory)) {
    throw badRequest("Kategori scrap tidak valid.");
  }
  const record = await prisma.scrapRecord.findFirst({
    where: { id: scrapId, organizationId: ctx.org.id },
  });
  if (!record) throw notFound("Catatan scrap tidak ditemukan.");
  if (record.status === "DISPOSED") throw conflict("Scrap yang sudah dibuang tidak dapat diklasifikasi ulang.");
  const updated = await prisma.scrapRecord.update({
    where: { id: record.id },
    data: { category },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "SCRAP_CLASSIFY", entityType: "ScrapRecord", entityId: record.id,
    before: { category: record.category }, after: { category },
  });
  return updated;
}

export interface DisposalInput {
  scrapRecordId?: string | null;
  itemId: string;
  locationId: string;
  quantity: string;
  method?: string;
  reason: string;
  date?: string;
}

/** Pembuangan: mengurangi stok scrap melalui transaksi DISPOSAL (PRD §14.7).
 *  Validasi mencegah disposal melebihi stok tersedia (kasus tepi §24.13). */
export async function disposeScrap(ctx: Ctx, input: DisposalInput) {
  const qty = toDec(input.quantity);
  if (qty.lte(0)) throw badRequest("Kuantitas pembuangan harus lebih besar dari nol.");
  if (!input.reason?.trim()) throw badRequest("Alasan pembuangan wajib diisi.");

  return withPostingLock(() =>
    prisma.$transaction(async (tx) => {
      let record = null;
      if (input.scrapRecordId) {
        record = await tx.scrapRecord.findFirst({
          where: { id: input.scrapRecordId, organizationId: ctx.org.id },
        });
        if (!record) throw notFound("Catatan scrap tidak ditemukan.");
        if (record.status !== "POSTED") throw conflict("Hanya scrap berstatus POSTED yang dapat dibuang.");
        // Cegah double-disposal atas kuantitas yang sama (kasus tepi §24.12)
        const alreadyDisposed = await tx.inventoryTransaction.findFirst({
          where: {
            organizationId: ctx.org.id,
            type: "DISPOSAL",
            status: "POSTED",
            refType: "SCRAP_RECORD",
            refId: record.id,
          },
          include: { lines: true },
        });
        if (alreadyDisposed) {
          const disposedQty = sumDec(
            alreadyDisposed.lines.filter((l) => l.itemId === record!.scrapItemId).map((l) => toDec(l.quantity).abs()),
          );
          if (disposedQty.gte(toDec(record.scrapQty))) {
            throw conflict(`Scrap ${record.number} sudah dibuang penuh melalui ${alreadyDisposed.number}.`);
          }
        }
      }

      const posted = await postTransactionWithinTx(tx, {
        orgId: ctx.org.id,
        userId: ctx.user.id,
        type: "DISPOSAL",
        date: input.date ? new Date(input.date) : new Date(),
        notes: `Pembuangan${input.method ? ` (${input.method})` : ""} — ${input.reason}`,
        reason: input.reason,
        refType: record ? "SCRAP_RECORD" : null,
        refId: record?.id ?? null,
        refNumber: record?.number ?? null,
        lines: [{
          itemId: input.itemId,
          locationId: input.locationId,
          quantity: qty.neg(),
        }],
      });

      if (record) {
        await tx.scrapRecord.update({
          where: { id: record.id },
          data: { status: "DISPOSED", disposalTransactionId: posted.id },
        });
      }
      await logAudit(tx, {
        orgId: ctx.org.id, userId: ctx.user.id,
        action: "SCRAP_DISPOSE", entityType: record ? "ScrapRecord" : "Item",
        entityId: record?.id ?? input.itemId,
        after: { txNumber: posted.number, qty: qty.toString(), method: input.method ?? null },
        reason: input.reason,
      });
      return posted;
    }),
  );
}

export async function listScrapRecords(
  orgId: string,
  filters: { category?: string; status?: string } = {},
) {
  return prisma.scrapRecord.findMany({
    where: {
      organizationId: orgId,
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: {
      sourceItem: { include: { baseUom: true } },
      scrapItem: { include: { baseUom: true } },
      productionOrder: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Metrik pemanfaatan material (PRD §14.9) — dari data aktual. */
export async function getScrapMetrics(orgId: string) {
  const records = await prisma.scrapRecord.findMany({
    where: { organizationId: orgId, status: { in: ["POSTED", "DISPOSED"] } },
    include: { sourceItem: true, scrapItem: true },
  });
  const consumptions = await prisma.materialConsumption.findMany({
    where: { organizationId: orgId, status: "POSTED" },
    select: { itemId: true, actualQty: true },
  });

  const totalConsumed = sumDec(consumptions.map((c) => toDec(c.actualQty)));
  const byCategory: Record<string, { count: number; qty: Decimal; value: Decimal }> = {
    REUSABLE: { count: 0, qty: new Decimal(0), value: new Decimal(0) },
    SALEABLE: { count: 0, qty: new Decimal(0), value: new Decimal(0) },
    DISPOSAL: { count: 0, qty: new Decimal(0), value: new Decimal(0) },
    PENDING: { count: 0, qty: new Decimal(0), value: new Decimal(0) },
  };
  for (const r of records) {
    const b = byCategory[r.category] ?? (byCategory[r.category] = { count: 0, qty: new Decimal(0), value: new Decimal(0) });
    b.count += 1;
    b.qty = b.qty.plus(toDec(r.scrapQty));
    if (r.estimatedValue) b.value = b.value.plus(toDec(r.estimatedValue));
  }
  const totalScrap = sumDec(records.map((r) => toDec(r.scrapQty)));
  return {
    totalConsumed,
    totalScrap,
    byCategory,
    // Rasio hanya dibandingkan dalam satuan masing-masing — tidak mencampur
    // satuan berbeda (PRD §14.9); interpretasi rasio ada di tampilan laporan
    // per satuan item.
    records,
  };
}
