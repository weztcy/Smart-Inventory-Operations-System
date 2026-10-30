// Layanan produksi: BOM ber-versi, production order, konsumsi material,
// hasil produksi, dan variance (PRD §13).
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { Decimal, toDec, sumDec } from "@/lib/decimal";
import { nextDocNumber } from "@/lib/numbering";
import {
  postTransactionWithinTx, withPostingLock, type EngineLineInput,
} from "@/lib/inventory/engine";

type Ctx = { org: { id: string }; user: { id: string } };

// ---------- BOM (PRD §13.1) ----------

export interface BOMInput {
  itemId: string; // finished good
  outputQty: string;
  notes?: string | null;
  components: { componentItemId: string; quantity: string; scrapPercent?: string }[];
}

export async function createBOM(ctx: Ctx, input: BOMInput) {
  if (toDec(input.outputQty).lte(0)) throw badRequest("Kuantitas output BOM harus lebih besar dari nol.");
  if (!input.components.length) throw badRequest("BOM harus memiliki minimal satu komponen.");
  for (const c of input.components) {
    if (toDec(c.quantity).lte(0)) throw badRequest("Kuantitas komponen harus lebih besar dari nol.");
  }
  return prisma.$transaction(async (tx) => {
    const product = await tx.item.findFirst({
      where: { id: input.itemId, organizationId: ctx.org.id },
    });
    if (!product) throw badRequest("Produk jadi tidak ditemukan.");
    if (product.type === "SCRAP") throw badRequest("Item scrap tidak dapat menjadi output BOM.");

    // Satu finished good dapat punya banyak versi (PRD §13.1)
    const maxVersion = await tx.billOfMaterials.aggregate({
      where: { organizationId: ctx.org.id, itemId: input.itemId },
      _max: { version: true },
    });
    const version = (maxVersion._max.version ?? 0) + 1;

    const code = await nextDocNumber(tx, ctx.org.id, "BOM");
    const bom = await tx.billOfMaterials.create({
      data: {
        organizationId: ctx.org.id,
        code,
        itemId: input.itemId,
        version,
        outputQty: toDec(input.outputQty).toString(),
        notes: input.notes || null,
        status: "ACTIVE",
        createdById: ctx.user.id,
        components: {
          create: input.components.map((c) => ({
            componentItemId: c.componentItemId,
            quantity: toDec(c.quantity).toString(),
            scrapPercent: c.scrapPercent ? toDec(c.scrapPercent).toString() : "0",
          })),
        },
      },
      include: { components: true },
    });
    await logAudit(tx, {
      orgId: ctx.org.id, userId: ctx.user.id,
      action: "BOM_CREATE", entityType: "BillOfMaterials", entityId: bom.id,
      after: { code, product: product.code, version, components: input.components.length },
    });
    return bom;
  });
}

export async function archiveBOM(ctx: Ctx, bomId: string) {
  const bom = await prisma.billOfMaterials.findFirst({
    where: { id: bomId, organizationId: ctx.org.id },
  });
  if (!bom) throw notFound("BOM tidak ditemukan.");
  // BOM terpakai dalam histori MO tidak boleh berubah merusak histori (PRD §13.1) —
  // pengarsipan menjaga histori; perubahan berarti versi baru.
  const updated = await prisma.billOfMaterials.update({
    where: { id: bom.id },
    data: { status: "ARCHIVED" },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "BOM_ARCHIVE", entityType: "BillOfMaterials", entityId: bom.id,
  });
  return updated;
}

// ---------- Production Order (PRD §13.2-§13.4) ----------

export interface MOInput {
  itemId: string;
  bomId: string;
  plannedQty: string;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  sourceWarehouseId: string;
  destinationWarehouseId?: string | null;
  assignedTo?: string | null;
  notes?: string | null;
}

export async function createProductionOrder(ctx: Ctx, input: MOInput) {
  if (toDec(input.plannedQty).lte(0)) throw badRequest("Kuantitas rencana harus lebih besar dari nol.");
  return prisma.$transaction(async (tx) => {
    const bom = await tx.billOfMaterials.findFirst({
      where: { id: input.bomId, organizationId: ctx.org.id, status: "ACTIVE" },
      include: { components: { include: { componentItem: true } }, item: true },
    });
    if (!bom) throw badRequest("BOM aktif tidak ditemukan.");
    if (bom.itemId !== input.itemId) throw badRequest("BOM tidak sesuai dengan produk yang dipilih.");
    const wh = await tx.warehouse.findFirst({
      where: { id: input.sourceWarehouseId, organizationId: ctx.org.id, isActive: true },
    });
    if (!wh) throw badRequest("Gudang sumber tidak valid.");

    const number = await nextDocNumber(tx, ctx.org.id, "MO");
    const mo = await tx.productionOrder.create({
      data: {
        organizationId: ctx.org.id,
        number,
        itemId: input.itemId,
        bomId: input.bomId,
        plannedQty: toDec(input.plannedQty).toString(),
        plannedStartDate: input.plannedStartDate ? new Date(input.plannedStartDate) : null,
        plannedEndDate: input.plannedEndDate ? new Date(input.plannedEndDate) : null,
        sourceWarehouseId: input.sourceWarehouseId,
        destinationWarehouseId: input.destinationWarehouseId || null,
        assignedTo: input.assignedTo || null,
        notes: input.notes || null,
        status: "DRAFT",
        createdById: ctx.user.id,
      },
    });
    await logAudit(tx, {
      orgId: ctx.org.id, userId: ctx.user.id,
      action: "MO_CREATE", entityType: "ProductionOrder", entityId: mo.id,
      after: { number, product: bom.item.code, plannedQty: input.plannedQty },
    });
    return mo;
  });
}

/** Konfirmasi MO: hitung kebutuhan material dari BOM dan cadangkan stok
 *  tersedia di gudang sumber (PRD §13.4, §8.1). */
export async function confirmProductionOrder(ctx: Ctx, moId: string) {
  return withPostingLock(() =>
    prisma.$transaction(async (tx) => {
      const mo = await tx.productionOrder.findFirst({
        where: { id: moId, organizationId: ctx.org.id },
        include: { bom: { include: { components: true } } },
      });
      if (!mo) throw notFound("Production order tidak ditemukan.");
      if (mo.status !== "DRAFT") throw conflict(`MO ${mo.number} berstatus ${mo.status}.`);

      const multiplier = toDec(mo.plannedQty).div(toDec(mo.bom.outputQty));
      for (const comp of mo.bom.components) {
        const need = multiplier
          .times(toDec(comp.quantity))
          .times(new Decimal(1).plus(toDec(comp.scrapPercent).div(100)));
        // Cari lokasi di gudang sumber yang memiliki stok untuk reservasi
        const balances = await tx.stockBalance.findMany({
          where: {
            organizationId: ctx.org.id,
            itemId: comp.componentItemId,
            location: { warehouseId: mo.sourceWarehouseId },
          },
        });
        let remaining = need;
        for (const b of balances) {
          if (remaining.lte(0)) break;
          const onHand = toDec(b.onHand);
          const free = onHand.minus(toDec(b.reserved));
          if (free.gt(0)) {
            const take = Decimal.min(free, remaining);
            await tx.stockBalance.update({
              where: { id: b.id },
              data: { reserved: toDec(b.reserved).plus(take).toString() },
            });
            await tx.stockReservation.create({
              data: {
                organizationId: ctx.org.id,
                itemId: comp.componentItemId,
                locationId: b.locationId,
                quantity: take.toString(),
                refType: "PRODUCTION_ORDER",
                refId: mo.id,
                note: `Reservasi MO ${mo.number}`,
                createdById: ctx.user.id,
              },
            });
            remaining = remaining.minus(take);
          }
        }
        // Kekurangan stok tidak memblokir konfirmasi — kebutuhan tetap tercatat
        // untuk dibandingkan dengan stok tersedia (PRD §13.4).
      }
      const updated = await tx.productionOrder.update({
        where: { id: mo.id },
        data: { status: "CONFIRMED" },
      });
      await logAudit(tx, {
        orgId: ctx.org.id, userId: ctx.user.id,
        action: "MO_CONFIRM", entityType: "ProductionOrder", entityId: mo.id,
        after: { number: mo.number },
      });
      return updated;
    }),
  );
}

export async function startProductionOrder(ctx: Ctx, moId: string) {
  const mo = await prisma.productionOrder.findFirst({
    where: { id: moId, organizationId: ctx.org.id },
  });
  if (!mo) throw notFound("Production order tidak ditemukan.");
  if (mo.status !== "CONFIRMED") throw conflict(`MO ${mo.number} berstatus ${mo.status}.`);
  const updated = await prisma.productionOrder.update({
    where: { id: mo.id },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "MO_START", entityType: "ProductionOrder", entityId: mo.id,
  });
  return updated;
}

export async function cancelProductionOrder(ctx: Ctx, moId: string) {
  return withPostingLock(() =>
    prisma.$transaction(async (tx) => {
      const mo = await tx.productionOrder.findFirst({
        where: { id: moId, organizationId: ctx.org.id },
        include: { consumptions: true, outputs: true },
      });
      if (!mo) throw notFound("Production order tidak ditemukan.");
      if (!["DRAFT", "CONFIRMED", "IN_PROGRESS"].includes(mo.status)) {
        throw conflict(`MO ${mo.number} berstatus ${mo.status} dan tidak dapat dibatalkan.`);
      }
      const hasPosted = mo.consumptions.some((c) => c.status === "POSTED") ||
        mo.outputs.some((o) => o.status === "POSTED");
      if (hasPosted) {
        throw conflict(
          "MO sudah memiliki konsumsi/hasil terposting. Selesaikan MO atau reverse transaksi terkait terlebih dahulu.",
        );
      }
      // Lepaskan seluruh reservasi
      const reservations = await tx.stockReservation.findMany({
        where: { organizationId: ctx.org.id, refType: "PRODUCTION_ORDER", refId: mo.id },
      });
      for (const r of reservations) {
        const bal = await tx.stockBalance.findUnique({
          where: { itemId_locationId: { itemId: r.itemId, locationId: r.locationId } },
        });
        if (bal) {
          const newReserved = Decimal.max(new Decimal(0), toDec(bal.reserved).minus(toDec(r.quantity)));
          await tx.stockBalance.update({
            where: { id: bal.id },
            data: { reserved: newReserved.toString() },
          });
        }
        await tx.stockReservation.delete({ where: { id: r.id } });
      }
      const updated = await tx.productionOrder.update({
        where: { id: mo.id },
        data: { status: "CANCELLED" },
      });
      await logAudit(tx, {
        orgId: ctx.org.id, userId: ctx.user.id,
        action: "MO_CANCEL", entityType: "ProductionOrder", entityId: mo.id,
      });
      return updated;
    }),
  );
}

/** Lepaskan reservasi sebesar kuantitas yang dikonsumsi. */
async function releaseReservation(
  tx: Parameters<Parameters<typeof prisma["$transaction"]>[0]>[0],
  orgId: string,
  moId: string,
  itemId: string,
  locationId: string,
  qty: Decimal,
) {
  const reservations = await tx.stockReservation.findMany({
    where: { organizationId: orgId, refType: "PRODUCTION_ORDER", refId: moId, itemId, locationId },
  });
  let remaining = qty;
  for (const r of reservations) {
    if (remaining.lte(0)) break;
    const release = Decimal.min(toDec(r.quantity), remaining);
    const bal = await tx.stockBalance.findUnique({
      where: { itemId_locationId: { itemId, locationId } },
    });
    if (bal) {
      await tx.stockBalance.update({
        where: { id: bal.id },
        data: { reserved: Decimal.max(new Decimal(0), toDec(bal.reserved).minus(release)).toString() },
      });
    }
    const left = toDec(r.quantity).minus(release);
    if (left.lte(0)) {
      await tx.stockReservation.delete({ where: { id: r.id } });
    } else {
      await tx.stockReservation.update({ where: { id: r.id }, data: { quantity: left.toString() } });
    }
    remaining = remaining.minus(release);
  }
}

// ---------- Konsumsi material aktual (PRD §13.5) ----------

export interface ConsumptionInput {
  moId: string;
  lines: { itemId: string; sourceLocationId: string; actualQty: string; notes?: string | null }[];
  date?: string;
}

export async function recordConsumption(ctx: Ctx, input: ConsumptionInput) {
  return withPostingLock(() =>
    prisma.$transaction(async (tx) => {
      const mo = await tx.productionOrder.findFirst({
        where: { id: input.moId, organizationId: ctx.org.id },
        include: { bom: { include: { components: true } } },
      });
      if (!mo) throw notFound("Production order tidak ditemukan.");
      if (!["CONFIRMED", "IN_PROGRESS"].includes(mo.status)) {
        throw conflict(`Konsumsi hanya dapat dicatat pada MO CONFIRMED/IN_PROGRESS (status: ${mo.status}).`);
      }

      const multiplier = toDec(mo.plannedQty).div(toDec(mo.bom.outputQty));
      const plannedMap = new Map<string, Decimal>();
      for (const c of mo.bom.components) {
        plannedMap.set(
          c.componentItemId,
          multiplier.times(toDec(c.quantity)).times(new Decimal(1).plus(toDec(c.scrapPercent).div(100))),
        );
      }

      const engineLines: EngineLineInput[] = [];
      for (const l of input.lines) {
        const qty = toDec(l.actualQty);
        if (qty.lte(0)) continue;
        engineLines.push({
          itemId: l.itemId,
          locationId: l.sourceLocationId,
          quantity: qty.neg(),
        });
      }
      if (!engineLines.length) throw badRequest("Tidak ada kuantitas konsumsi yang valid.");

      // Posting pengurangan stok lewat engine; konsumsi boleh melampaui reservasi
      // sendiri sehingga pemeriksaan reservasi dilewati (PRD §13.5).
      const posted = await postTransactionWithinTx(tx, {
        orgId: ctx.org.id,
        userId: ctx.user.id,
        type: "CONSUMPTION",
        date: input.date ? new Date(input.date) : new Date(),
        notes: `Konsumsi MO ${mo.number}`,
        refType: "PRODUCTION_ORDER",
        refId: mo.id,
        refNumber: mo.number,
        lines: engineLines,
        ignoreReservations: true,
      });

      // Catatan konsumpsi + pelepasan reservasi
      for (const l of engineLines) {
        const consumption = await tx.materialConsumption.create({
          data: {
            organizationId: ctx.org.id,
            productionOrderId: mo.id,
            itemId: l.itemId,
            sourceLocationId: l.locationId,
            plannedQty: (plannedMap.get(l.itemId) ?? new Decimal(0)).toString(),
            actualQty: l.quantity.abs().toString(),
            status: "POSTED",
            consumedAt: new Date(),
            recordedById: ctx.user.id,
            notes: null,
            transactionId: null,
          },
        });
        await tx.materialConsumption.update({
          where: { id: consumption.id },
          data: { transactionId: posted.id },
        });
        await releaseReservation(tx, ctx.org.id, mo.id, l.itemId, l.locationId, l.quantity.abs());
      }

      // MO otomatis berjalan
      if (mo.status === "CONFIRMED") {
        await tx.productionOrder.update({
          where: { id: mo.id },
          data: { status: "IN_PROGRESS", startedAt: mo.startedAt ?? new Date() },
        });
      }
      await logAudit(tx, {
        orgId: ctx.org.id, userId: ctx.user.id,
        action: "MO_CONSUME", entityType: "ProductionOrder", entityId: mo.id,
        after: { txNumber: posted.number, lines: engineLines.length },
      });
      return posted;
    }),
  );
}

// ---------- Hasil produksi (PRD §13.6) ----------

export interface OutputInput {
  moId: string;
  destinationLocationId: string;
  actualQty: string;
  date?: string;
  notes?: string | null;
}

export async function recordOutput(ctx: Ctx, input: OutputInput) {
  return withPostingLock(() =>
    prisma.$transaction(async (tx) => {
      const mo = await tx.productionOrder.findFirst({
        where: { id: input.moId, organizationId: ctx.org.id },
        include: { item: true },
      });
      if (!mo) throw notFound("Production order tidak ditemukan.");
      if (!["CONFIRMED", "IN_PROGRESS"].includes(mo.status)) {
        throw conflict(`Hasil produksi hanya dapat dicatat pada MO CONFIRMED/IN_PROGRESS (status: ${mo.status}).`);
      }
      const qty = toDec(input.actualQty);
      if (qty.lte(0)) throw badRequest("Kuantitas hasil produksi harus lebih besar dari nol.");

      const posted = await postTransactionWithinTx(tx, {
        orgId: ctx.org.id,
        userId: ctx.user.id,
        type: "OUTPUT",
        date: input.date ? new Date(input.date) : new Date(),
        notes: input.notes ?? `Hasil MO ${mo.number}`,
        refType: "PRODUCTION_ORDER",
        refId: mo.id,
        refNumber: mo.number,
        lines: [{ itemId: mo.itemId, locationId: input.destinationLocationId, quantity: qty }],
      });

      const output = await tx.productionOutput.create({
        data: {
          organizationId: ctx.org.id,
          productionOrderId: mo.id,
          itemId: mo.itemId,
          destinationLocationId: input.destinationLocationId,
          plannedQty: toDec(mo.plannedQty).toString(),
          actualQty: qty.toString(),
          resultType: "GOOD",
          status: "POSTED",
          recordedAt: new Date(),
          recordedById: ctx.user.id,
          notes: input.notes || null,
        },
      });
      await tx.productionOutput.update({
        where: { id: output.id },
        data: { transactionId: posted.id },
      });
      if (mo.status === "CONFIRMED") {
        await tx.productionOrder.update({
          where: { id: mo.id },
          data: { status: "IN_PROGRESS", startedAt: mo.startedAt ?? new Date() },
        });
      }
      await logAudit(tx, {
        orgId: ctx.org.id, userId: ctx.user.id,
        action: "MO_OUTPUT", entityType: "ProductionOrder", entityId: mo.id,
        after: { txNumber: posted.number, qty: qty.toString() },
      });
      return posted;
    }),
  );
}

// ---------- Penyelesaian & variance (PRD §13.7-§13.8) ----------

export async function completeProductionOrder(ctx: Ctx, moId: string, confirmNoMoreConsumption: boolean) {
  return prisma.$transaction(async (tx) => {
    const mo = await tx.productionOrder.findFirst({
      where: { id: moId, organizationId: ctx.org.id },
      include: { consumptions: true, outputs: true, bom: { include: { components: true } } },
    });
    if (!mo) throw notFound("Production order tidak ditemukan.");
    if (mo.status !== "IN_PROGRESS" && mo.status !== "CONFIRMED") {
      throw conflict(`MO ${mo.number} berstatus ${mo.status} dan tidak dapat diselesaikan.`);
    }
    const hasOutput = mo.outputs.some((o) => o.status === "POSTED");
    if (!hasOutput) {
      throw badRequest("Hasil produksi belum dicatat. Catat output sebelum menyelesaikan MO.");
    }
    // Sistem TIDAK mengasumsikan seluruh BOM terkonsumsi otomatis (PRD §13.7):
    // user harus mengonfirmasi eksplisit.
    const hasConsumption = mo.consumptions.some((c) => c.status === "POSTED");
    if (!hasConsumption && !confirmNoMoreConsumption) {
      throw badRequest(
        "MO belum memiliki konsumsi material. Centang konfirmasi 'tidak ada konsumsi tambahan' bila memang demikian.",
      );
    }
    const updated = await tx.productionOrder.update({
      where: { id: mo.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await logAudit(tx, {
      orgId: ctx.org.id, userId: ctx.user.id,
      action: "MO_COMPLETE", entityType: "ProductionOrder", entityId: mo.id,
      after: { number: mo.number, confirmedNoConsumption: !hasConsumption && confirmNoMoreConsumption },
    });
    return updated;
  });
}

export async function getProductionOrderDetail(orgId: string, moId: string) {
  const mo = await prisma.productionOrder.findFirst({
    where: { id: moId, organizationId: orgId },
    include: {
      item: { include: { baseUom: true } },
      bom: { include: { components: { include: { componentItem: { include: { baseUom: true } } } } } },
      consumptions: {
        include: { item: { include: { baseUom: true } } },
        orderBy: { consumedAt: "desc" },
      },
      outputs: true,
    },
  });
  if (!mo) return null;

  // Kebutuhan rencana vs aktual (PRD §13.4, §13.8) — planned ≠ actual.
  const multiplier = toDec(mo.plannedQty).div(toDec(mo.bom.outputQty));
  const variance = mo.bom.components.map((c) => {
    const planned = multiplier
      .times(toDec(c.quantity))
      .times(new Decimal(1).plus(toDec(c.scrapPercent).div(100)));
    const actual = sumDec(
      mo.consumptions.filter((k) => k.itemId === c.componentItemId && k.status === "POSTED").map((k) => toDec(k.actualQty)),
    );
    return {
      component: c.componentItem,
      planned,
      actual,
      varianceQty: actual.minus(planned),
    };
  });
  const totalOutput = sumDec(mo.outputs.filter((o) => o.status === "POSTED").map((o) => toDec(o.actualQty)));
  const outputVariance = totalOutput.minus(toDec(mo.plannedQty));

  return { mo, variance, totalOutput, outputVariance };
}

export async function listProductionOrders(
  orgId: string,
  filters: { status?: string } = {},
) {
  return prisma.productionOrder.findMany({
    where: {
      organizationId: orgId,
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: { item: true, bom: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listBOMs(orgId: string) {
  return prisma.billOfMaterials.findMany({
    where: { organizationId: orgId },
    include: {
      item: { include: { baseUom: true } },
      components: { include: { componentItem: { include: { baseUom: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}
