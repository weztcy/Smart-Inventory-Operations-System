// Layanan laporan & export CSV (PRD §16). Semua angka dari data aktual.
import { prisma } from "@/lib/db";
import { Decimal, toDec, sumDec } from "@/lib/decimal";
import { getStockRows, getValuation, getMovements, getStockByLocation } from "@/lib/inventory/queries";
import { toCsv } from "@/lib/services/importCsv";
import { TX_TYPE_LABELS, ISSUE_TYPE_LABELS } from "@/lib/constants";
import type { TxType } from "@/lib/constants";

// ---------- Export CSV ----------

export async function exportStockOnHandCsv(orgId: string): Promise<string> {
  const rows = await getStockRows(orgId, {});
  return toCsv([
    ["Kode", "Nama", "Tipe", "Kategori", "Satuan", "On Hand", "Tercadang", "Tersedia", "Avg Cost", "Nilai", "Min Stock"],
    ...rows.map((r) => [
      r.code, r.name, r.type, r.categoryName ?? "", r.uomCode,
      r.onHand.toFixed(4), r.reserved.toFixed(4), r.available.toFixed(4),
      r.avgCost.toFixed(6), r.value.toFixed(4), r.minStock?.toFixed(4) ?? "",
    ]),
  ]);
}

export async function exportStockByLocationCsv(orgId: string, warehouseId?: string): Promise<string> {
  const rows = await getStockByLocation(orgId, { warehouseId });
  return toCsv([
    ["Gudang", "Lokasi", "Kode Item", "Nama Item", "Satuan", "On Hand", "Tercadang", "Tersedia"],
    ...rows.map((r) => [
      r.warehouseCode, `${r.locationCode} — ${r.locationName}`, r.itemCode, r.itemName, r.uomCode,
      r.onHand.toFixed(4), r.reserved.toFixed(4), r.available.toFixed(4),
    ]),
  ]);
}

export async function exportValuationCsv(orgId: string): Promise<string> {
  const { rows, totalValue } = await getValuation(orgId);
  return toCsv([
    ["Kode", "Nama", "Satuan", "Kuantitas", "Avg Cost", "Nilai"],
    ...rows.map((r) => [
      r.code, r.name, r.uomCode, r.onHand.toFixed(4), r.avgCost.toFixed(6), r.value.toFixed(4),
    ]),
    ["TOTAL", "", "", "", "", totalValue.toFixed(4)],
  ]);
}

export async function exportMovementsCsv(orgId: string): Promise<string> {
  const { entries } = await getMovements(orgId, { page: 1, pageSize: 100 });
  return toCsv([
    ["Waktu", "No Transaksi", "Jenis", "Item", "Lokasi", "Kuantitas", "Biaya Satuan", "Nilai", "Saldo Lokasi"],
    ...entries.map((e) => [
      e.createdAt.toISOString(),
      e.transaction.number,
      e.transaction.type,
      `${e.item.code} — ${e.item.name}`,
      e.location.code,
      toDec(e.quantity).toFixed(4),
      e.unitCost ? toDec(e.unitCost).toFixed(6) : "",
      toDec(e.value).toFixed(4),
      e.runningQty ? toDec(e.runningQty).toFixed(4) : "",
    ]),
  ]);
}

export async function exportProductionVarianceCsv(orgId: string): Promise<string> {
  const rows = await getProductionVarianceReport(orgId);
  return toCsv([
    ["MO", "Produk", "Status", "Rencana Qty", "Output Aktual", "Variance Output",
     "Komponen", "Rencana Konsumsi", "Aktual Konsumsi", "Variance Konsumsi"],
    ...rows.flatMap((r) =>
      r.components.length
        ? r.components.map((c) => [
            r.number, r.product, r.status, r.plannedQty, r.totalOutput.toFixed(4),
            r.outputVariance.toFixed(4),
            `${c.componentCode} — ${c.componentName}`,
            c.planned.toFixed(4), c.actual.toFixed(4), c.variance.toFixed(4),
          ])
        : [[r.number, r.product, r.status, r.plannedQty, r.totalOutput.toFixed(4), r.outputVariance.toFixed(4), "", "", "", ""]],
    ),
  ]);
}

export async function exportPurchaseCsv(orgId: string): Promise<string> {
  const rows = await getPurchaseReport(orgId);
  return toCsv([
    ["PO", "Supplier", "Status", "Dipesan", "Diterima", "Outstanding", "Terlambat"],
    ...rows.map((r) => [
      r.number, r.supplier, r.status,
      r.ordered.toFixed(4), r.received.toFixed(4), r.outstanding.toFixed(4),
      r.isLate ? "YA" : "",
    ]),
  ]);
}

export async function exportScrapCsv(orgId: string): Promise<string> {
  const records = await prisma.scrapRecord.findMany({
    where: { organizationId: orgId },
    include: { sourceItem: true, scrapItem: true, productionOrder: true },
    orderBy: { scrapDate: "desc" },
  });
  return toCsv([
    ["Nomor", "Tanggal", "MO", "Material Sumber", "Item Scrap", "Kuantitas", "Kategori", "Status",
     "Estimasi Nilai", "Penyebab"],
    ...records.map((r) => [
      r.number, r.scrapDate.toISOString().slice(0, 10), r.productionOrder?.number ?? "",
      r.sourceItem.code, r.scrapItem.code, toDec(r.scrapQty).toFixed(4),
      r.category, r.status,
      r.estimatedValue ? toDec(r.estimatedValue).toFixed(4) : "",
      r.cause ?? "",
    ]),
  ]);
}

export async function exportAuditCsv(orgId: string): Promise<string> {
  const logs = await prisma.auditLog.findMany({
    where: { organizationId: orgId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  return toCsv([
    ["Waktu", "User", "Aksi", "Entity", "Entity ID", "Alasan"],
    ...logs.map((l) => [
      l.createdAt.toISOString(),
      l.user ? `${l.user.name} <${l.user.email}>` : "-",
      l.action, l.entityType, l.entityId ?? "", l.reason ?? "",
    ]),
  ]);
}

// ---------- Data laporan ----------

export interface ProductionVarianceRow {
  number: string;
  product: string;
  status: string;
  plannedQty: string;
  totalOutput: ReturnType<typeof sumDec>;
  outputVariance: ReturnType<typeof sumDec>;
  components: {
    componentCode: string; componentName: string;
    planned: ReturnType<typeof sumDec>; actual: ReturnType<typeof sumDec>;
    variance: ReturnType<typeof sumDec>;
  }[];
}

/** Laporan planned vs actual per production order (PRD §16.4). */
export async function getProductionVarianceReport(orgId: string): Promise<ProductionVarianceRow[]> {
  const mos = await prisma.productionOrder.findMany({
    where: { organizationId: orgId },
    include: {
      item: true,
      bom: { include: { components: { include: { componentItem: true } } } },
      consumptions: { where: { status: "POSTED" } },
      outputs: { where: { status: "POSTED" } },
    },
    orderBy: { createdAt: "desc" },
  });
  return mos.map((mo) => {
    const multiplier = toDec(mo.plannedQty).div(toDec(mo.bom.outputQty));
    const components = mo.bom.components.map((c) => {
      const planned = multiplier.times(toDec(c.quantity))
        .times(new Decimal(1).plus(toDec(c.scrapPercent).div(100)));
      const actual = sumDec(
        mo.consumptions.filter((k) => k.itemId === c.componentItemId).map((k) => toDec(k.actualQty)),
      );
      return {
        componentCode: c.componentItem.code,
        componentName: c.componentItem.name,
        planned,
        actual,
        variance: actual.minus(planned),
      };
    });
    const totalOutput = sumDec(mo.outputs.map((o) => toDec(o.actualQty)));
    return {
      number: mo.number,
      product: `${mo.item.code} — ${mo.item.name}`,
      status: mo.status,
      plannedQty: mo.plannedQty,
      totalOutput,
      outputVariance: totalOutput.minus(toDec(mo.plannedQty)),
      components,
    };
  });
}

/** Laporan pembelian: ordered vs received + PO outstanding (PRD §16.3). */
export async function getPurchaseReport(orgId: string) {
  const pos = await prisma.purchaseOrder.findMany({
    where: { organizationId: orgId },
    include: { supplier: true, lines: true },
    orderBy: { orderDate: "desc" },
  });
  return pos.map((po) => {
    const ordered = sumDec(po.lines.map((l) => toDec(l.orderedQty)));
    const received = sumDec(po.lines.map((l) => toDec(l.receivedQty)));
    return {
      number: po.number,
      supplier: po.supplier.name,
      orderDate: po.orderDate,
      expectedDate: po.expectedDate,
      status: po.status,
      ordered,
      received,
      outstanding: ordered.minus(received),
      isLate: po.expectedDate
        ? po.expectedDate < new Date() && received.lt(ordered) && po.status !== "RECEIVED" && po.status !== "CANCELLED"
        : false,
    };
  });
}

/** Konsumsi material tertinggi & scrap tertinggi (PRD §16.5). */
export async function getTopConsumedItems(orgId: string, limit = 10) {
  const rows = await prisma.materialConsumption.groupBy({
    by: ["itemId"],
    where: { organizationId: orgId, status: "POSTED" },
    _count: { _all: true },
  });
  const items = await prisma.item.findMany({
    where: { id: { in: rows.map((r) => r.itemId) } },
    include: { baseUom: true },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const consumptions = await prisma.materialConsumption.findMany({
    where: { organizationId: orgId, status: "POSTED" },
    select: { itemId: true, actualQty: true },
  });
  const qtyByItem = new Map<string, ReturnType<typeof sumDec>>();
  for (const c of consumptions) {
    qtyByItem.set(c.itemId, (qtyByItem.get(c.itemId) ?? sumDec([])).plus(toDec(c.actualQty)));
  }
  return [...qtyByItem.entries()]
    .map(([id, qty]) => ({ item: itemMap.get(id)!, qty }))
    .filter((r) => r.item)
    .sort((a, b) => b.qty.comparedTo(a.qty))
    .slice(0, limit);
}

export async function getTopScrapSources(orgId: string, limit = 10) {
  const records = await prisma.scrapRecord.findMany({
    where: { organizationId: orgId, status: { in: ["POSTED", "DISPOSED"] } },
    include: { sourceItem: { include: { baseUom: true } } },
  });
  const map = new Map<string, { source: (typeof records)[0]["sourceItem"]; qty: ReturnType<typeof sumDec>; count: number }>();
  for (const r of records) {
    const e = map.get(r.sourceItemId) ?? { source: r.sourceItem, qty: sumDec([]), count: 0 };
    e.qty = e.qty.plus(toDec(r.scrapQty));
    e.count += 1;
    map.set(r.sourceItemId, e);
  }
  return [...map.values()].sort((a, b) => b.qty.comparedTo(a.qty)).slice(0, limit);
}

export { TX_TYPE_LABELS, ISSUE_TYPE_LABELS };
export type { TxType };
