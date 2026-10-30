// Integration tests — alur bisnis ujung-ke-ujung (PRD §26.3 skenario A-D).
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { Decimal, toDec } from "@/lib/decimal";
import { registerOrganization } from "@/lib/services/org";
import { createItem } from "@/lib/services/items";
import { createSupplier } from "@/lib/services/master";
import { createOpeningStock } from "@/lib/services/transactions";
import {
  createPurchaseOrder, submitPO, approvePO, receivePurchaseOrder, cancelPO,
} from "@/lib/services/purchase";
import {
  createBOM, createProductionOrder, confirmProductionOrder, startProductionOrder,
  recordConsumption, recordOutput, completeProductionOrder, cancelProductionOrder,
  getProductionOrderDetail,
} from "@/lib/services/production";
import { createScrapRecord, classifyScrap, disposeScrap } from "@/lib/services/scrap";
import { createStockCount, saveCounts, reconcileStockCount } from "@/lib/services/opname";

type Ctx = { org: { id: string; maxItems: null; maxUsers: null; maxWarehouses: null }; user: { id: string } };

let ctx: Ctx;
let orgId: string;
let plat: string; let baut: string; let meja: string; let scrapItem: string;
let locRaw: string; let locFin: string; let locScrap: string; let whId: string;

const balance = async (item: string, loc: string) => {
  const b = await prisma.stockBalance.findUnique({
    where: { itemId_locationId: { itemId: item, locationId: loc } },
  });
  return b ? toDec(b.onHand) : new Decimal(0);
};

beforeAll(async () => {
  const r = await registerOrganization({
    name: "Owner Flow", email: "flow@test.com", password: "password123", orgName: "PT Flow",
  });
  orgId = r.orgId;
  ctx = { org: { id: r.orgId, maxItems: null, maxUsers: null, maxWarehouses: null }, user: { id: r.userId } };

  const uoms = await prisma.unitOfMeasure.findMany({ where: { organizationId: orgId } });
  const kg = uoms.find((u) => u.code === "kg")!.id;
  const pcs = uoms.find((u) => u.code === "pcs")!.id;

  plat = (await createItem(ctx, { code: "F-PLAT", name: "Plat", type: "RAW_MATERIAL", baseUomId: kg })).id;
  baut = (await createItem(ctx, { code: "F-BAUT", name: "Baut", type: "RAW_MATERIAL", baseUomId: pcs, minStock: "500" })).id;
  meja = (await createItem(ctx, { code: "F-MEJA", name: "Meja", type: "FINISHED_GOODS", baseUomId: pcs })).id;
  scrapItem = (await createItem(ctx, { code: "F-SCRAP", name: "Scrap Plat", type: "SCRAP", baseUomId: kg })).id;

  const locs = await prisma.storageLocation.findMany({ where: { organizationId: orgId } });
  locRaw = locs.find((l) => l.code === "WH-01-RAW")!.id;
  locFin = locs.find((l) => l.code === "WH-01-FIN")!.id;
  locScrap = locs.find((l) => l.code === "WH-01-SCR")!.id;
  whId = (await prisma.warehouse.findFirstOrThrow({ where: { organizationId: orgId, code: "WH-01" } })).id;

  await createOpeningStock(ctx, {
    lines: [
      { itemId: plat, locationId: locRaw, quantity: "1000", unitCost: "50000" },
      { itemId: baut, locationId: locRaw, quantity: "2000", unitCost: "1500" },
    ],
  });
});

describe("Skenario A: Purchasing (PRD §26.3)", () => {
  it("PO → terima parsial → status → terima sisa → status RECEIVED", async () => {
    const sup = await createSupplier(ctx, { code: "F-SUP", name: "Supplier Flow" });
    const po = await createPurchaseOrder(ctx, { supplierId: sup.id, submit: true, lines: [
      { itemId: plat, orderedQty: "100", unitPrice: "52000" },
    ] });
    expect(po.status).toBe("SUBMITTED");
    await approvePO(ctx, po.id);
    const poAfterApprove = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    expect(poAfterApprove.status).toBe("APPROVED");

    const line = (await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: po.id } })).id;
    const r1 = await receivePurchaseOrder(ctx, po.id, {
      locationId: locRaw, lines: [{ poLineId: line, receivedQty: "60" }],
    });
    expect(r1.number).toMatch(/^RCV-/);
    const poAfter1 = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    expect(poAfter1.status).toBe("PARTIALLY_RECEIVED");
    expect((await balance(plat, locRaw)).toNumber()).toBe(1060);

    // Over-receiving ditolak (PRD §9.4)
    await expect(
      receivePurchaseOrder(ctx, po.id, { locationId: locRaw, lines: [{ poLineId: line, receivedQty: "41" }] }),
    ).rejects.toThrow(/melebihi sisa pesanan/);

    await receivePurchaseOrder(ctx, po.id, {
      locationId: locRaw, lines: [{ poLineId: line, receivedQty: "40" }],
    });
    const poAfter2 = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    expect(poAfter2.status).toBe("RECEIVED");
    expect((await balance(plat, locRaw)).toNumber()).toBe(1100);
  });

  it("PO yang sudah menerima sebagian tidak dapat dibatalkan (kasus tepi §24.10)", async () => {
    const sup = await createSupplier(ctx, { code: "F-SUP2", name: "Supplier Flow 2" });
    const po = await createPurchaseOrder(ctx, { supplierId: sup.id, submit: true, lines: [
      { itemId: baut, orderedQty: "100", unitPrice: "1600" },
    ] });
    const line = (await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: po.id } })).id;
    await receivePurchaseOrder(ctx, po.id, { locationId: locRaw, lines: [{ poLineId: line, receivedQty: "10" }] });
    await expect(cancelPO(ctx, po.id)).rejects.toThrow(/sudah memiliki penerimaan|tidak dapat dibatalkan/);
  });
});

describe("Skenario C: Production (PRD §26.3)", () => {
  it("BOM → MO → konsumsi → output → selesai → variance terverifikasi", async () => {
    const bom = await createBOM(ctx, {
      itemId: meja, outputQty: "1",
      components: [
        { componentItemId: plat, quantity: "10" },
        { componentItemId: baut, quantity: "20", scrapPercent: "5" },
      ],
    });
    const mo = await createProductionOrder(ctx, {
      itemId: meja, bomId: bom.id, plannedQty: "10", sourceWarehouseId: whId,
    });
    await confirmProductionOrder(ctx, mo.id);
    // Reservasi dibuat sesuai kebutuhan (10*10=100 plat; 20*1.05*10=210 baut)
    const reservations = await prisma.stockReservation.findMany({
      where: { refType: "PRODUCTION_ORDER", refId: mo.id },
    });
    const reservedPlat = reservations.filter((r) => r.itemId === plat).reduce((a, r) => a.plus(toDec(r.quantity)), new Decimal(0));
    expect(reservedPlat.toNumber()).toBe(100);

    await startProductionOrder(ctx, mo.id);

    // Stok tercadang tidak bisa dipakai issue lain melebihi available (PRD §10.3)
    const { createIssue } = await import("@/lib/services/transactions");
    await expect(
      createIssue(ctx, {
        issueType: "SALE",
        lines: [{ itemId: plat, locationId: locRaw, quantity: "1100" }],
      }, "post"),
    ).rejects.toThrow(/tercadang|Stok tidak cukup/);

    await recordConsumption(ctx, {
      moId: mo.id,
      lines: [
        { itemId: plat, sourceLocationId: locRaw, actualQty: "98" },
        { itemId: baut, sourceLocationId: locRaw, actualQty: "205" },
      ],
    });
    // Reservasi dilepas sebesar yang dikonsumsi; sisa (rencana-aktual) tetang
    // tercadang untuk konsumsi lanjutan sampai MO selesai/dibatalkan.
    const reservationsAfter = await prisma.stockReservation.findMany({
      where: { refType: "PRODUCTION_ORDER", refId: mo.id },
    });
    const leftover = reservationsAfter.reduce((a, r) => a.plus(toDec(r.quantity)), new Decimal(0));
    expect(leftover.toNumber()).toBe(7); // plat 100-98=2, baut 210-205=5

    await recordOutput(ctx, { moId: mo.id, destinationLocationId: locFin, actualQty: "9" });
    expect((await balance(meja, locFin)).toNumber()).toBe(9);

    await completeProductionOrder(ctx, mo.id, false);
    const detail = await getProductionOrderDetail(orgId, mo.id);
    expect(detail!.mo.status).toBe("COMPLETED");
    // Variance konsumsi: plat 98-100 = -2; baut 205-210 = -5; output 9-10 = -1
    const vPlat = detail!.variance.find((v) => v.component.id === plat)!;
    const vBaut = detail!.variance.find((v) => v.component.id === baut)!;
    expect(vPlat.actual.toNumber()).toBe(98);
    expect(vPlat.varianceQty.toNumber()).toBe(-2);
    expect(vBaut.varianceQty.toNumber()).toBe(-5);
    expect(detail!.outputVariance.toNumber()).toBe(-1);
  });

  it("MO tanpa konsumsi & tanpa konfirmasi tidak bisa diselesaikan (PRD §13.7)", async () => {
    const bom = await createBOM(ctx, {
      itemId: meja, outputQty: "1", components: [{ componentItemId: plat, quantity: "1" }],
    });
    const mo = await createProductionOrder(ctx, {
      itemId: meja, bomId: bom.id, plannedQty: "2", sourceWarehouseId: whId,
    });
    await confirmProductionOrder(ctx, mo.id);
    await startProductionOrder(ctx, mo.id);
    await recordOutput(ctx, { moId: mo.id, destinationLocationId: locFin, actualQty: "2" });
    await expect(completeProductionOrder(ctx, mo.id, false)).rejects.toThrow(/konsumsi/);
    await completeProductionOrder(ctx, mo.id, true); // eksplisit: tidak ada konsumsi tambahan
  });

  it("MO dibatalkan melepas reservasi", async () => {
    const bom = await createBOM(ctx, {
      itemId: meja, outputQty: "1", components: [{ componentItemId: plat, quantity: "5" }],
    });
    const mo = await createProductionOrder(ctx, {
      itemId: meja, bomId: bom.id, plannedQty: "4", sourceWarehouseId: whId,
    });
    await confirmProductionOrder(ctx, mo.id);
    const balBefore = await prisma.stockBalance.findUniqueOrThrow({
      where: { itemId_locationId: { itemId: plat, locationId: locRaw } },
    });
    await cancelProductionOrder(ctx, mo.id);
    const balAfter = await prisma.stockBalance.findUniqueOrThrow({
      where: { itemId_locationId: { itemId: plat, locationId: locRaw } },
    });
    expect(toDec(balAfter.reserved).toNumber()).toBe(toDec(balBefore.reserved).minus(20).toNumber());
  });
});

describe("Skenario D: Scrap reuse (PRD §26.3)", () => {
  it("catat scrap → stok scrap terlacak → reuse dikonsumsi → disposal divalidasi", async () => {
    // Konsumsi produksi sudah mengurangi plat; scrap masuk sebagai item scrap.
    const platBefore = await balance(plat, locRaw);
    const s = await createScrapRecord(ctx, {
      sourceItemId: plat, sourceLocationId: locRaw,
      scrapItemId: scrapItem, scrapQty: "12", category: "REUSABLE",
      destinationLocationId: locScrap, estimatedValue: "300000",
    });
    expect(s.number).toMatch(/^SCR-/);
    expect((await balance(scrapItem, locScrap)).toNumber()).toBe(12);
    // Material sumber TIDAK berkurang dua kali (PRD §14.8)
    expect((await balance(plat, locRaw)).toNumber()).toBe(platBefore.toNumber());

    // Reuse: konsumsi scrap untuk produksi
    const bom2 = await createBOM(ctx, {
      itemId: meja, outputQty: "1", components: [{ componentItemId: scrapItem, quantity: "4" }],
    });
    const mo = await createProductionOrder(ctx, {
      itemId: meja, bomId: bom2.id, plannedQty: "2", sourceWarehouseId: whId,
    });
    await confirmProductionOrder(ctx, mo.id);
    await startProductionOrder(ctx, mo.id);
    await recordConsumption(ctx, {
      moId: mo.id,
      lines: [{ itemId: scrapItem, sourceLocationId: locScrap, actualQty: "5" }],
    });
    expect((await balance(scrapItem, locScrap)).toNumber()).toBe(7);

    // Klasifikasi bisa diubah dan tercatat
    await classifyScrap(ctx, s.recordId, "SALEABLE");
    const rec = await prisma.scrapRecord.findUniqueOrThrow({ where: { id: s.recordId } });
    expect(rec.category).toBe("SALEABLE");

    // Disposal melebihi stok ditolak (kasus tepi §24.13)
    await expect(
      disposeScrap(ctx, {
        itemId: scrapItem, locationId: locScrap, quantity: "8", reason: "lebih dari stok",
      }),
    ).rejects.toThrow(/Stok tidak cukup/);

    await disposeScrap(ctx, {
      scrapRecordId: s.recordId,
      itemId: scrapItem, locationId: locScrap, quantity: "3",
      method: "pengepul", reason: "ukuran terlalu kecil",
    });
    expect((await balance(scrapItem, locScrap)).toNumber()).toBe(4);
    const recAfter = await prisma.scrapRecord.findUniqueOrThrow({ where: { id: s.recordId } });
    expect(recAfter.status).toBe("DISPOSED");

    // Double disposal penuh ditolak (kasus tepi §24.12)
    await expect(
      disposeScrap(ctx, {
        scrapRecordId: s.recordId,
        itemId: scrapItem, locationId: locScrap, quantity: "4", reason: "ulang",
      }),
    ).rejects.toThrow(/sudah dibuang penuh|Hanya scrap berstatus POSTED/);
  });
});

describe("Skenario E: Stock opname (PRD §26.3, PRD §12)", () => {
  it("snapshot → hitung → rekonsiliasi menghasilkan adjustment & alert", async () => {
    const count = await createStockCount(ctx, { warehouseId: whId, locationId: locRaw });
    const lines = await prisma.stockCountLine.findMany({
      where: { stockCountId: count.id },
      include: { item: true },
    });
    expect(lines.length).toBeGreaterThan(0);

    // Transaksi terjadi SETELAH baseline — tidak boleh tertimpa (PRD §12.4)
    const { createIssue } = await import("@/lib/services/transactions");
    await createIssue(ctx, {
      issueType: "INTERNAL_USE",
      lines: [{ itemId: baut, locationId: locRaw, quantity: "100" }],
    }, "post");

    const bautLine = lines.find((l) => l.itemId === baut)!;
    const platLine = lines.find((l) => l.itemId === plat)!;
    const bautNow = await balance(baut, locRaw);
    await saveCounts(ctx, count.id, [
      { lineId: bautLine.id, countedQty: bautNow.plus(5).toString() }, // selisih +5 fisik
      { lineId: platLine.id, countedQty: platLine.baselineQty }, // tidak berubah
    ]);
    const result = await reconcileStockCount(ctx, count.id);
    expect(result.adjustments).toBe(1);

    // Stok baut = hitung fisik (current + 5)
    expect((await balance(baut, locRaw)).toNumber()).toBe(bautNow.plus(5).toNumber());
    const reconciled = await prisma.stockCount.findUniqueOrThrow({ where: { id: count.id } });
    expect(reconciled.status).toBe("RECONCILED");
    expect(reconciled.adjustmentTransactionId).toBeTruthy();
  });

  it("alert stok minimum aktif lalu resolved", async () => {
    // baut minStock 500. Turunkan di bawah minimum.
    const { createIssue } = await import("@/lib/services/transactions");
    const cur = await balance(baut, locRaw);
    await createIssue(ctx, {
      issueType: "INTERNAL_USE",
      lines: [{ itemId: baut, locationId: locRaw, quantity: cur.minus(400).toString() }],
    }, "post");
    const alert = await prisma.alert.findFirst({
      where: { organizationId: orgId, type: "LOW_STOCK", itemId: baut, status: "ACTIVE" },
    });
    expect(alert).toBeTruthy();
    // Tambah stok kembali → alert resolved otomatis
    const { createReceipt } = await import("@/lib/services/transactions");
    await createReceipt(ctx, {
      lines: [{ itemId: baut, locationId: locRaw, quantity: "600" }],
    }, "post");
    const resolved = await prisma.alert.findFirst({
      where: { organizationId: orgId, type: "LOW_STOCK", itemId: baut, status: "RESOLVED" },
    });
    expect(resolved).toBeTruthy();
  });
});
