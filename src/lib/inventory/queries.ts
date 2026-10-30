// Query stok, pergerakan, dan agregasi laporan — selalu ter-scope organisasi.
import { prisma } from "@/lib/db";
import { Decimal, toDec, sumDec } from "@/lib/decimal";

// ---------- Stok per item ----------

export interface StockRow {
  itemId: string;
  code: string;
  name: string;
  type: string;
  categoryName: string | null;
  uomCode: string;
  onHand: Decimal;
  reserved: Decimal;
  available: Decimal;
  avgCost: Decimal;
  value: Decimal;
  minStock: Decimal | null;
}

export async function getStockRows(
  orgId: string,
  filters: {
    q?: string; itemId?: string;
    warehouseId?: string; lowStockOnly?: boolean; positiveOnly?: boolean;
  } = {},
): Promise<StockRow[]> {
  const balances = await prisma.stockBalance.findMany({
    where: { organizationId: orgId },
    include: {
      item: { include: { category: true, baseUom: true } },
      location: { include: { warehouse: true } },
    },
  });

  const byItem = new Map<string, StockRow>();
  for (const b of balances) {
    if (filters.warehouseId && b.location.warehouseId !== filters.warehouseId) continue;
    if (filters.itemId && b.item.id !== filters.itemId) continue;
    let row = byItem.get(b.itemId);
    if (!row) {
      row = {
        itemId: b.item.id,
        code: b.item.code,
        name: b.item.name,
        type: b.item.type,
        categoryName: b.item.category?.name ?? null,
        uomCode: b.item.baseUom.code,
        onHand: new Decimal(0),
        reserved: new Decimal(0),
        available: new Decimal(0),
        avgCost: toDec(b.item.avgCost),
        value: new Decimal(0),
        minStock: b.item.minStock ? toDec(b.item.minStock) : null,
      };
      byItem.set(b.itemId, row);
    }
    row.onHand = row.onHand.plus(toDec(b.onHand));
    row.reserved = row.reserved.plus(toDec(b.reserved));
  }

  let rows = [...byItem.values()];
  for (const r of rows) {
    r.available = r.onHand.minus(r.reserved);
    r.value = r.onHand.times(r.avgCost);
  }

  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }
  if (filters.lowStockOnly) rows = rows.filter((r) => r.minStock !== null && r.available.lt(r.minStock));
  if (filters.positiveOnly) rows = rows.filter((r) => r.onHand.gt(0));
  rows.sort((a, b) => a.code.localeCompare(b.code));
  return rows;
}

/** Varian filter kategori berbasis id langsung. */
export async function getStockRowsByCategory(orgId: string, categoryId: string): Promise<StockRow[]> {
  const rows = await getStockRows(orgId, {});
  const items = await prisma.item.findMany({
    where: { organizationId: orgId, categoryId },
    select: { id: true },
  });
  const ids = new Set(items.map((i) => i.id));
  return rows.filter((r) => ids.has(r.itemId));
}

// ---------- Stok per lokasi ----------

export interface StockByLocationRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  uomCode: string;
  warehouseId: string;
  warehouseCode: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  onHand: Decimal;
  reserved: Decimal;
  available: Decimal;
}

export async function getStockByLocation(
  orgId: string,
  filters: { warehouseId?: string; q?: string } = {},
): Promise<StockByLocationRow[]> {
  const balances = await prisma.stockBalance.findMany({
    where: {
      organizationId: orgId,
      ...(filters.warehouseId ? { location: { warehouseId: filters.warehouseId } } : {}),
    },
    include: {
      item: { include: { baseUom: true } },
      location: { include: { warehouse: true } },
    },
    orderBy: { item: { code: "asc" } },
  });
  let rows = balances.map((b) => {
    const onHand = toDec(b.onHand);
    const reserved = toDec(b.reserved);
    return {
      itemId: b.itemId,
      itemCode: b.item.code,
      itemName: b.item.name,
      uomCode: b.item.baseUom.code,
      warehouseId: b.location.warehouseId,
      warehouseCode: b.location.warehouse.code,
      locationId: b.locationId,
      locationCode: b.location.code,
      locationName: b.location.name,
      onHand,
      reserved,
      available: onHand.minus(reserved),
    };
  });
  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter((r) => r.itemCode.toLowerCase().includes(q) || r.itemName.toLowerCase().includes(q));
  }
  return rows.filter((r) => r.onHand.gt(0));
}

// ---------- Detail stok satu item ----------

export async function getItemStockDetail(orgId: string, itemId: string) {
  const item = await prisma.item.findFirst({
    where: { id: itemId, organizationId: orgId },
    include: { category: true, baseUom: true },
  });
  if (!item) return null;
  const balances = await prisma.stockBalance.findMany({
    where: { itemId, organizationId: orgId },
    include: { location: { include: { warehouse: true } } },
  });
  const movements = await prisma.ledgerEntry.findMany({
    where: { organizationId: orgId, itemId },
    include: {
      transaction: { select: { number: true, type: true, status: true, date: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return { item, balances, movements };
}

// ---------- Pergerakan (ledger) ----------

export interface MovementFilter {
  q?: string;
  itemId?: string;
  locationId?: string;
  warehouseId?: string;
  type?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export async function getMovements(orgId: string, f: MovementFilter = {}) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, f.pageSize ?? 25));
  const where = {
    organizationId: orgId,
    ...(f.itemId ? { itemId: f.itemId } : {}),
    ...(f.locationId ? { locationId: f.locationId } : {}),
    ...(f.warehouseId ? { location: { warehouseId: f.warehouseId } } : {}),
    ...(f.type ? { transaction: { type: f.type } } : {}),
    ...(f.from || f.to
      ? {
          createdAt: {
            ...(f.from ? { gte: f.from } : {}),
            ...(f.to ? { lte: f.to } : {}),
          },
        }
      : {}),
    ...(f.q
      ? {
          OR: [
            { item: { code: { contains: f.q } } },
            { item: { name: { contains: f.q } } },
            { transaction: { number: { contains: f.q } } },
          ],
        }
      : {}),
  };
  const [total, entries] = await Promise.all([
    prisma.ledgerEntry.count({ where }),
    prisma.ledgerEntry.findMany({
      where,
      include: {
        item: { include: { baseUom: true } },
        location: true,
        transaction: { select: { number: true, type: true, status: true, date: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pageSize, entries };
}

// ---------- Valuasi ----------

export async function getValuation(orgId: string) {
  const rows = await getStockRows(orgId, { positiveOnly: true });
  const totalValue = sumDec(rows.map((r) => r.value));
  return { rows, totalValue };
}

// ---------- Stok menipis & reorder ----------

export async function getLowStockItems(orgId: string) {
  const rows = await getStockRows(orgId, {});
  return rows
    .filter((r) => r.minStock !== null && r.available.lt(r.minStock))
    .map((r) => ({
      ...r,
      shortfall: r.minStock!.minus(r.available),
      reorder: r.available.lt(r.minStock!)
        ? (r.onHand.lt(0) ? r.minStock! : r.minStock!.minus(r.available))
        : new Decimal(0),
    }));
}

// ---------- Stok mengendap ----------

export async function getSlowMovingItems(orgId: string, days = 90) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const balances = await prisma.stockBalance.findMany({
    where: { organizationId: orgId },
    include: { item: { include: { baseUom: true } }, location: { include: { warehouse: true } } },
  });
  const rows = [];
  for (const b of balances) {
    if (toDec(b.onHand).lte(0)) continue;
    const last = await prisma.ledgerEntry.findFirst({
      where: { organizationId: orgId, itemId: b.itemId, locationId: b.locationId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, quantity: true },
    });
    const idle = !last || last.createdAt < cutoff;
    if (idle) {
      rows.push({
        ...b,
        item: b.item,
        onHandDec: toDec(b.onHand),
        lastMovementAt: last?.createdAt ?? null,
      });
    }
  }
  rows.sort((a, b) => (a.lastMovementAt?.getTime() ?? 0) - (b.lastMovementAt?.getTime() ?? 0));
  return rows;
}

// ---------- Dashboard (PRD §16.1) — semua dari data aktual ----------

export async function getDashboardMetrics(orgId: string) {
  const [
    stockRows, activeItems, openPOs, activeProductions,
    scrapStats, pendingTxs, recentLedger, activeAlerts,
  ] = await Promise.all([
    getStockRows(orgId, {}),
    prisma.item.count({ where: { organizationId: orgId, isActive: true } }),
    prisma.purchaseOrder.count({
      where: { organizationId: orgId, status: { in: ["SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED"] } },
    }),
    prisma.productionOrder.count({
      where: { organizationId: orgId, status: { in: ["CONFIRMED", "IN_PROGRESS"] } },
    }),
    prisma.scrapRecord.groupBy({
      by: ["category", "status"],
      where: { organizationId: orgId },
      _count: { _all: true },
    }),
    prisma.inventoryTransaction.count({
      where: { organizationId: orgId, status: "DRAFT" },
    }),
    prisma.ledgerEntry.findMany({
      where: { organizationId: orgId },
      include: {
        item: { include: { baseUom: true } },
        transaction: { select: { number: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.alert.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { item: true },
    }),
  ]);

  const totalOnHandValue = sumDec(stockRows.map((r) => r.value));
  const lowStock = stockRows.filter((r) => r.minStock !== null && r.available.lt(r.minStock)).length;
  const scrapCounts = { REUSABLE: 0, SALEABLE: 0, DISPOSAL: 0, PENDING: 0 } as Record<string, number>;
  for (const g of scrapStats) {
    if (g.status === "POSTED" || g.status === "DISPOSED") {
      scrapCounts[g.category] = (scrapCounts[g.category] ?? 0) + g._count._all;
    }
  }

  // Konsumsi & scrap 30 hari terakhir untuk tren
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [consumed30, produced30] = await Promise.all([
    prisma.inventoryTransaction.aggregate({
      _count: { _all: true },
      where: { organizationId: orgId, type: "CONSUMPTION", status: "POSTED", postedAt: { gte: since30 } },
    }),
    prisma.inventoryTransaction.aggregate({
      _count: { _all: true },
      where: { organizationId: orgId, type: "OUTPUT", status: "POSTED", postedAt: { gte: since30 } },
    }),
  ]);

  return {
    totalValue: totalOnHandValue,
    totalItems: stockRows.length,
    activeItems,
    lowStockCount: lowStock,
    openPOs,
    activeProductions,
    pendingTxs,
    scrapCounts,
    consumed30: consumed30._count._all,
    produced30: produced30._count._all,
    recentLedger,
    activeAlerts,
  };
}
