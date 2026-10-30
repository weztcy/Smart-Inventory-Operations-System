// Layanan stock opname / penghitungan fisik (PRD §12.2-§12.4).
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { toDec, storeQty } from "@/lib/decimal";
import { nextDocNumber } from "@/lib/numbering";
import { postTransactionWithinTx, withPostingLock, type EngineLineInput } from "@/lib/inventory/engine";

type Ctx = { org: { id: string }; user: { id: string } };

export interface CountInput {
  warehouseId: string;
  locationId?: string | null;
  notes?: string | null;
}

/** Mulai opname: snapshot stok sistem sebagai baseline (PRD §12.2). */
export async function createStockCount(ctx: Ctx, input: CountInput) {
  return prisma.$transaction(async (tx) => {
    const wh = await tx.warehouse.findFirst({
      where: { id: input.warehouseId, organizationId: ctx.org.id },
    });
    if (!wh) throw badRequest("Gudang tidak ditemukan.");
    if (input.locationId) {
      const loc = await tx.storageLocation.findFirst({
        where: { id: input.locationId, organizationId: ctx.org.id, warehouseId: input.warehouseId },
      });
      if (!loc) throw badRequest("Lokasi tidak sesuai dengan gudang.");
    }

    const balances = await tx.stockBalance.findMany({
      where: {
        organizationId: ctx.org.id,
        location: {
          warehouseId: input.warehouseId,
          ...(input.locationId ? { id: input.locationId } : {}),
        },
      },
    });

    const number = await nextDocNumber(tx, ctx.org.id, "OPN");
    const count = await tx.stockCount.create({
      data: {
        organizationId: ctx.org.id,
        number,
        warehouseId: input.warehouseId,
        locationId: input.locationId ?? null,
        status: "IN_PROGRESS",
        notes: input.notes || null,
        createdById: ctx.user.id,
      },
    });
    for (const b of balances) {
      await tx.stockCountLine.create({
        data: {
          stockCountId: count.id,
          itemId: b.itemId,
          locationId: b.locationId,
          baselineQty: b.onHand,
        },
      });
    }
    await logAudit(tx, {
      orgId: ctx.org.id, userId: ctx.user.id,
      action: "OPNAME_CREATE", entityType: "StockCount", entityId: count.id,
      after: { number, lines: balances.length },
    });
    return count;
  });
}

export async function saveCounts(
  ctx: Ctx,
  countId: string,
  lines: { lineId: string; countedQty: string | null }[],
) {
  const count = await prisma.stockCount.findFirst({
    where: { id: countId, organizationId: ctx.org.id },
  });
  if (!count) throw notFound("Stock count tidak ditemukan.");
  if (count.status !== "IN_PROGRESS") {
    throw conflict(`Stock count ${count.number} berstatus ${count.status} dan tidak dapat diisi.`);
  }
  for (const l of lines) {
    if (l.countedQty === null || l.countedQty === "") {
      await prisma.stockCountLine.updateMany({
        where: { id: l.lineId, stockCountId: count.id },
        data: { countedQty: null },
      });
      continue;
    }
    const v = toDec(l.countedQty);
    if (v.lt(0)) throw badRequest("Hasil hitung fisik tidak boleh negatif.");
    await prisma.stockCountLine.updateMany({
      where: { id: l.lineId, stockCountId: count.id },
      data: { countedQty: storeQty(v) },
    });
  }
}

/** Rekonsiliasi: hitung variance terhadap stok SAAT INI (bukan baseline)
 *  agar transaksi yang terjadi selama penghitungan tidak tertimpa (PRD §12.4),
 *  lalu posting adjustment lewat engine. */
export async function reconcileStockCount(ctx: Ctx, countId: string) {
  return withPostingLock(() =>
    prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.findFirst({
        where: { id: countId, organizationId: ctx.org.id },
        include: { lines: { include: { item: true } } },
      });
      if (!count) throw notFound("Stock count tidak ditemukan.");
      if (count.status !== "IN_PROGRESS") {
        throw conflict(`Stock count ${count.number} berstatus ${count.status} dan tidak dapat direkonsiliasi.`);
      }

      const adjLines: EngineLineInput[] = [];
      const updates: { lineId: string; systemQty: string; adjusted: string }[] = [];
      for (const line of count.lines) {
        if (line.countedQty === null) continue;
        const balance = await tx.stockBalance.findUnique({
          where: { itemId_locationId: { itemId: line.itemId, locationId: line.locationId } },
        });
        const systemQty = toDec(balance?.onHand);
        const counted = toDec(line.countedQty);
        const delta = counted.minus(systemQty);
        updates.push({
          lineId: line.id,
          systemQty: storeQty(systemQty),
          adjusted: storeQty(delta),
        });
        if (!delta.eq(0)) {
          adjLines.push({
            itemId: line.itemId,
            locationId: line.locationId,
            quantity: delta,
          });
        }
      }

      let adjustmentTxId: string | null = null;
      if (adjLines.length > 0) {
        const posted = await postTransactionWithinTx(tx, {
          orgId: ctx.org.id,
          userId: ctx.user.id,
          type: "ADJUSTMENT",
          notes: `Hasil opname ${count.number}`,
          reason: "stock-count-variance",
          refType: "STOCK_COUNT",
          refId: count.id,
          refNumber: count.number,
          lines: adjLines,
          ignoreReservations: true,
        });
        adjustmentTxId = posted.id;
      }

      for (const u of updates) {
        await tx.stockCountLine.update({
          where: { id: u.lineId },
          data: { systemQtyAtReconcile: u.systemQty, adjustedQty: u.adjusted },
        });
      }
      await tx.stockCount.update({
        where: { id: count.id },
        data: {
          status: "RECONCILED",
          reconciledAt: new Date(),
          submittedAt: count.submittedAt ?? new Date(),
          adjustmentTransactionId: adjustmentTxId,
        },
      });
      await logAudit(tx, {
        orgId: ctx.org.id, userId: ctx.user.id,
        action: "OPNAME_RECONCILE", entityType: "StockCount", entityId: count.id,
        after: { number: count.number, adjustments: adjLines.length, adjustmentTxId },
      });
      return { number: count.number, adjustments: adjLines.length, adjustmentTxId };
    }),
  );
}

export async function cancelStockCount(ctx: Ctx, countId: string) {
  const count = await prisma.stockCount.findFirst({
    where: { id: countId, organizationId: ctx.org.id },
  });
  if (!count) throw notFound("Stock count tidak ditemukan.");
  if (count.status === "RECONCILED") throw conflict("Stock count yang sudah direkonsiliasi tidak dapat dibatalkan.");
  await prisma.stockCount.update({ where: { id: count.id }, data: { status: "CANCELLED" } });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "OPNAME_CANCEL", entityType: "StockCount", entityId: count.id,
  });
}

export async function listStockCounts(orgId: string) {
  return prisma.stockCount.findMany({
    where: { organizationId: orgId },
    include: {
      warehouse: true,
      lines: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getStockCountDetail(orgId: string, countId: string) {
  const count = await prisma.stockCount.findFirst({
    where: { id: countId, organizationId: orgId },
    include: {
      warehouse: true,
      lines: {
        include: { item: { include: { baseUom: true } }, location: true },
        orderBy: { item: { code: "asc" } },
      },
    },
  });
  if (!count) return null;
  return count;
}
