// ============================================================
// INVENTORY ENGINE — satu-satunya jalur perubahan stok (PRD §8, BR-01).
//
// Jaminan yang diberikan engine:
//  1. Semua perubahan saldo, ledger, valuasi, dan alert terjadi
//     dalam SATU transaksi database (atomic posting, BR-03).
//  2. Stok negatif ditolak saat posting (PRD §8.6).
//  3. Posting divalidasi terhadap stok terkini, bukan draft (BR-08).
//  4. Transaksi POSTED tidak pernah diubah — koreksi lewat reversal (BR-02, BR-13).
//  5. Idempotency key mencegah efek ganda dari request ulang (BR-04).
//  6. Posting diserialisasi lewat lock proses + transaksi DB (PRD §8.7).
//  7. Nilai keluar-masuk memakai moving weighted average (PRD §8.5).
// ============================================================
import { prisma, type Tx } from "@/lib/db";
import { AppError, notFound, conflict, forbidden } from "@/lib/errors";
import {
  Decimal, toDec, storeQty, storeCost, storeValue, computeMovingAverage,
} from "@/lib/decimal";
import { nextDocNumber } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import {
  TX_PREFIXES, type TxType, BLOCKING_SUBSCRIPTION_STATUSES,
} from "@/lib/constants";

// ---------- Lock serialisasi posting (PRD §8.7) ----------
let postingChain: Promise<unknown> = Promise.resolve();

/** Serialisasi semua posting dalam satu proses Node: mencegah dua posting
 *  membaca saldo sama lalu sama-sama lolos validasi stok. */
export function withPostingLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = postingChain.then(fn, fn);
  postingChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export interface EngineLineInput {
  itemId: string;
  locationId: string;
  /** Signed, dalam BASE unit item. Positif = masuk. */
  quantity: Decimal;
  /** Biaya satuan untuk baris masuk (atau koreksi); null = valuasi 0. */
  unitCost?: Decimal | null;
  notes?: string | null;
}

export interface PostTxInput {
  orgId: string;
  userId: string;
  type: TxType;
  date?: Date;
  notes?: string | null;
  reason?: string | null;
  reference?: string | null;
  refType?: string | null;
  refId?: string | null;
  refNumber?: string | null;
  idempotencyKey?: string | null;
  lines: EngineLineInput[];
  /** Lewati pemeriksaan reservasi (dipakai konsumsi produksi yang melepas reservasi sendiri). */
  ignoreReservations?: boolean;
  /** Izinkan item nonaktif (dipakai reversal transaksi historis, PRD §6.3). */
  allowInactiveItems?: boolean;
}

interface MergedLine {
  itemId: string;
  locationId: string;
  quantity: Decimal;
  unitCost: Decimal | null;
  costWeight: Decimal; // jumlah |qty|*cost untuk rata-rata bila digabung
  notes: string | null;
}

function mergeLines(lines: EngineLineInput[]): MergedLine[] {
  const map = new Map<string, MergedLine>();
  for (const l of lines) {
    if (l.quantity.eq(0)) continue;
    const key = `${l.itemId}|${l.locationId}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        itemId: l.itemId,
        locationId: l.locationId,
        quantity: l.quantity,
        unitCost: l.unitCost ?? null,
        costWeight: l.unitCost ? l.quantity.abs().times(l.unitCost) : new Decimal(0),
        notes: l.notes ?? null,
      });
    } else {
      existing.quantity = existing.quantity.plus(l.quantity);
      if (l.unitCost) {
        existing.costWeight = existing.costWeight.plus(l.quantity.abs().times(l.unitCost));
      }
      if (l.notes) {
        existing.notes = existing.notes ? `${existing.notes}; ${l.notes}` : l.notes;
      }
    }
  }
  const merged = [...map.values()].filter((l) => !l.quantity.eq(0));
  // Bila baris sama digabung dengan cost berbeda, pakai rata-rata tertimbang.
  for (const l of merged) {
    if (l.unitCost && l.costWeight.gt(0) && l.quantity.gt(0)) {
      l.unitCost = l.costWeight.div(l.quantity);
    }
  }
  return merged;
}

async function assertOrgCanTransact(tx: Tx, orgId: string) {
  const org = await tx.organization.findUnique({
    where: { id: orgId },
    include: { subscription: true },
  });
  if (!org) throw notFound("Organisasi tidak ditemukan.");
  if (org.status === "SUSPENDED") {
    throw forbidden("Organisasi ditangguhkan — transaksi baru tidak diizinkan.");
  }
  const sub = org.subscription;
  if (
    sub &&
    BLOCKING_SUBSCRIPTION_STATUSES.includes(sub.status as (typeof BLOCKING_SUBSCRIPTION_STATUSES)[number])
  ) {
    throw forbidden("Langganan tidak aktif — transaksi baru diblokir.");
  }
}

interface ItemRef {
  id: string; code: string; name: string;
  avgCost: string; isActive: boolean; minStock: string | null;
}
interface LocRef {
  id: string; code: string; name: string;
  isActive: boolean; warehouseId: string;
}

async function loadLineRefs(
  tx: Tx,
  orgId: string,
  lines: MergedLine[],
  allowInactiveItems: boolean,
): Promise<{ itemMap: Map<string, ItemRef>; locMap: Map<string, LocRef> }> {
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const locationIds = [...new Set(lines.map((l) => l.locationId))];

  const items = await tx.item.findMany({
    where: { id: { in: itemIds }, organizationId: orgId },
  });
  const locations = await tx.storageLocation.findMany({
    where: { id: { in: locationIds }, organizationId: orgId },
  });

  const itemMap = new Map<string, ItemRef>(items.map((i) => [i.id, i]));
  const locMap = new Map<string, LocRef>(locations.map((l) => [l.id, l]));

  for (const l of lines) {
    const item = itemMap.get(l.itemId);
    if (!item) throw notFound(`Item tidak ditemukan di organisasi ini.`);
    if (!item.isActive && !allowInactiveItems) {
      throw badRequestItem(item.code, item.name);
    }
    const loc = locMap.get(l.locationId);
    if (!loc) throw notFound(`Lokasi penyimpanan tidak ditemukan di organisasi ini.`);
    if (!loc.isActive) {
      throw badRequestLoc(loc.code, loc.name);
    }
  }
  return { itemMap, locMap };
}

function badRequestItem(code: string, name: string) {
  return new AppError(400, `Item ${code} (${name}) sudah nonaktif dan tidak dapat dipakai dalam transaksi baru.`);
}
function badRequestLoc(code: string, name: string) {
  return new AppError(400, `Lokasi ${code} (${name}) sudah nonaktif dan tidak dapat menerima transaksi baru.`);
}

interface ComputedLine {
  itemId: string; warehouseId: string; locationId: string;
  quantity: string; unitCost: string | null; value: string; notes: string | null;
}
interface ComputedLedger {
  itemId: string; locationId: string; quantity: string;
  unitCost: string | null; value: string; runningQty: string;
}

/** Proses baris: validasi saldo, update saldo, avg cost, ledger, alert.
 *  Mengembalikan data baris siap simpan. */
async function applyLines(
  tx: Tx,
  input: PostTxInput,
  lines: MergedLine[],
  itemMap: Map<string, ItemRef>,
  locMap: Map<string, LocRef>,
): Promise<{ lineData: ComputedLine[]; ledgerData: ComputedLedger[] }> {
  const { orgId, ignoreReservations } = input;
  const lineData: ComputedLine[] = [];
  const ledgerData: ComputedLedger[] = [];

  // Peta saldo item organisasi (untuk perhitungan moving average).
  const orgQtyCache = new Map<string, Decimal>();
  const orgQtyDelta = new Map<string, Decimal>();

  for (const line of lines) {
    const item = itemMap.get(line.itemId)!;
    const loc = locMap.get(line.locationId)!;

    const balance = await tx.stockBalance.findUnique({
      where: { itemId_locationId: { itemId: line.itemId, locationId: line.locationId } },
    });
    const onHand = toDec(balance?.onHand);
    const reserved = toDec(balance?.reserved);
    const newOnHand = onHand.plus(line.quantity);

    // Validasi ketersediaan stok terkini (BR-08, PRD §8.6)
    if (newOnHand.lt(0)) {
      throw conflict(
        `Stok tidak cukup untuk ${item.code} (${item.name}) di lokasi ${loc.code}: ` +
        `tersedia ${onHand.toFixed(4)}, transaksi butuh ${line.quantity.abs().toFixed(4)}.`,
      );
    }
    // Stok tercadang tidak boleh terpakai untuk transaksi lain (PRD §10.3)
    if (!ignoreReservations && newOnHand.lt(reserved)) {
      throw conflict(
        `Stok ${item.code} di ${loc.code} sebagian tercadang untuk produksi. ` +
        `Tersedia bebas cadangan: ${onHand.minus(reserved).toFixed(4)}, diminta ${line.quantity.abs().toFixed(4)}.`,
      );
    }

    // ----- Valuasi & moving weighted average -----
    let unitCost: Decimal | null = null;
    if (line.quantity.gt(0)) {
      unitCost = line.unitCost ?? null;
      if (unitCost) {
        let orgQty = orgQtyCache.get(line.itemId);
        if (orgQty === undefined) {
          const rows = await tx.stockBalance.findMany({
            where: { itemId: line.itemId, organizationId: orgId },
            select: { onHand: true },
          });
          orgQty = rows.reduce((acc, r) => acc.plus(toDec(r.onHand)), new Decimal(0));
          orgQtyCache.set(line.itemId, orgQty);
        }
        orgQty = orgQty.plus(orgQtyDelta.get(line.itemId) ?? 0);
        const { newAvg } = computeMovingAverage(
          orgQty, toDec(item.avgCost), line.quantity, unitCost,
        );
        await tx.item.update({
          where: { id: line.itemId },
          data: { avgCost: storeCost(newAvg) },
        });
        item.avgCost = storeCost(newAvg);
        orgQtyDelta.set(
          line.itemId,
          (orgQtyDelta.get(line.itemId) ?? new Decimal(0)).plus(line.quantity),
        );
      }
    } else {
      // Keluar barang: valuasi pada avg cost berlaku saat posting (PRD §8.5)
      unitCost = line.unitCost ?? toDec(item.avgCost);
    }
    const value = unitCost ? line.quantity.times(unitCost) : new Decimal(0);

    // ----- Update saldo -----
    await tx.stockBalance.upsert({
      where: { itemId_locationId: { itemId: line.itemId, locationId: line.locationId } },
      create: {
        organizationId: orgId,
        itemId: line.itemId,
        locationId: line.locationId,
        onHand: storeQty(newOnHand),
      },
      update: { onHand: storeQty(newOnHand) },
    });

    lineData.push({
      itemId: line.itemId,
      warehouseId: loc.warehouseId,
      locationId: line.locationId,
      quantity: storeQty(line.quantity),
      unitCost: unitCost ? storeCost(unitCost) : null,
      value: storeValue(value),
      notes: line.notes,
    });
    ledgerData.push({
      itemId: line.itemId,
      locationId: line.locationId,
      quantity: storeQty(line.quantity),
      unitCost: unitCost ? storeCost(unitCost) : null,
      value: storeValue(value),
      runningQty: storeQty(newOnHand),
    });

    // ----- Alert stok minimum (PRD §15.1) -----
    await upsertLowStockAlert(tx, {
      orgId, item, locationId: line.locationId, newOnHand,
    });
  }

  return { lineData, ledgerData };
}

async function upsertLowStockAlert(
  tx: Tx,
  { orgId, item, locationId, newOnHand }: {
    orgId: string;
    item: ItemRef;
    locationId: string;
    newOnHand: Decimal;
  },
) {
  const minStock = item.minStock ? toDec(item.minStock) : null;
  const existing = await tx.alert.findFirst({
    where: {
      organizationId: orgId, type: "LOW_STOCK", itemId: item.id,
      locationId, status: "ACTIVE",
    },
  });
  if (minStock !== null && newOnHand.lt(minStock)) {
    const message = `Stok ${item.code} (${item.name}) di bawah minimum: ${newOnHand.toFixed(4)} < ${minStock.toFixed(4)}.`;
    if (existing) {
      await tx.alert.update({
        where: { id: existing.id },
        data: { currentQty: storeQty(newOnHand), thresholdQty: storeQty(minStock), message },
      });
    } else {
      await tx.alert.create({
        data: {
          organizationId: orgId, type: "LOW_STOCK", itemId: item.id, locationId,
          message, currentQty: storeQty(newOnHand), thresholdQty: storeQty(minStock),
        },
      });
    }
  } else if (existing) {
    await tx.alert.update({
      where: { id: existing.id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  }
}

/** Buat + posting transaksi dalam satu transaksi database. */
export async function createAndPostTransaction(
  input: PostTxInput,
): Promise<{ id: string; number: string }> {
  return withPostingLock(() =>
    prisma.$transaction(async (tx) => {
      const posted = await postTransactionWithinTx(tx, input);
      return posted;
    }),
  );
}

/** Inti posting — panggil dalam transaksi Prisma. */
export async function postTransactionWithinTx(
  tx: Tx,
  input: PostTxInput,
): Promise<{ id: string; number: string }> {
  await assertOrgCanTransact(tx, input.orgId);

  // Idempotency (BR-04): request ulang mengembalikan transaksi yang sama.
  if (input.idempotencyKey) {
    const existing = await tx.inventoryTransaction.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: input.orgId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return { id: existing.id, number: existing.number };
  }

  if (!input.lines.length) throw new AppError(400, "Transaksi harus memiliki minimal satu baris item.");

  const merged = mergeLines(input.lines);
  if (!merged.length) throw new AppError(400, "Semua baris memiliki kuantitas nol.");
  const { itemMap, locMap } = await loadLineRefs(tx, input.orgId, merged, !!input.allowInactiveItems);

  const number = await nextDocNumber(tx, input.orgId, TX_PREFIXES[input.type], input.date);

  const header = await tx.inventoryTransaction.create({
    data: {
      organizationId: input.orgId,
      number,
      type: input.type,
      status: "POSTED",
      date: input.date ?? new Date(),
      postedAt: new Date(),
      notes: input.notes ?? null,
      reason: input.reason ?? null,
      reference: input.reference ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      refNumber: input.refNumber ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      createdById: input.userId,
      postedById: input.userId,
    },
  });

  const { lineData, ledgerData } = await applyLines(tx, input, merged, itemMap, locMap);

  for (const ld of lineData) {
    const line = await tx.inventoryTransactionLine.create({
      data: { transactionId: header.id, ...ld },
    });
    const idx = ledgerData.findIndex((g) => g.itemId === ld.itemId && g.locationId === ld.locationId);
    const gl = ledgerData[idx];
    await tx.ledgerEntry.create({
      data: {
        organizationId: input.orgId,
        transactionId: header.id,
        lineId: line.id,
        itemId: gl.itemId,
        locationId: gl.locationId,
        entryType: "POST",
        quantity: gl.quantity,
        unitCost: gl.unitCost,
        value: gl.value,
        runningQty: gl.runningQty,
        userId: input.userId,
      },
    });
  }

  await logAudit(tx, {
    orgId: input.orgId,
    userId: input.userId,
    action: `TX_POST_${input.type}`,
    entityType: "InventoryTransaction",
    entityId: header.id,
    after: { number, type: input.type, lines: lineData.length },
  });

  return { id: header.id, number };
}

/** Buat draft transaksi — tidak mengubah stok (PRD §8.4). */
export async function createDraftTransaction(
  input: PostTxInput,
): Promise<{ id: string; number: string }> {
  return prisma.$transaction(async (tx) => {
    await assertOrgCanTransact(tx, input.orgId);
    if (input.idempotencyKey) {
      const existing = await tx.inventoryTransaction.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.orgId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return { id: existing.id, number: existing.number };
    }
    if (!input.lines.length) throw new AppError(400, "Transaksi harus memiliki minimal satu baris item.");
    const merged = mergeLines(input.lines);
    if (!merged.length) throw new AppError(400, "Semua baris memiliki kuantitas nol.");
    const { itemMap, locMap } = await loadLineRefs(tx, input.orgId, merged, !!input.allowInactiveItems);

    const number = await nextDocNumber(tx, input.orgId, TX_PREFIXES[input.type], input.date);
    const header = await tx.inventoryTransaction.create({
      data: {
        organizationId: input.orgId,
        number,
        type: input.type,
        status: "DRAFT",
        date: input.date ?? new Date(),
        notes: input.notes ?? null,
        reason: input.reason ?? null,
        reference: input.reference ?? null,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        refNumber: input.refNumber ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        createdById: input.userId,
      },
    });
    for (const l of merged) {
      const loc = locMap.get(l.locationId)!;
      await tx.inventoryTransactionLine.create({
        data: {
          transactionId: header.id,
          itemId: l.itemId,
          warehouseId: loc.warehouseId,
          locationId: l.locationId,
          quantity: storeQty(l.quantity),
          unitCost: l.unitCost ? storeCost(l.unitCost) : null,
          value: "0.0000",
          notes: l.notes,
        },
      });
    }
    await logAudit(tx, {
      orgId: input.orgId, userId: input.userId,
      action: `TX_DRAFT_${input.type}`,
      entityType: "InventoryTransaction", entityId: header.id,
      after: { number, lines: merged.length },
    });
    return { id: header.id, number };
  });
}

/** Posting draft: validasi ulang stok terkini lalu terapkan efek (PRD §8.6). */
export async function postDraftTransaction(
  prismaLike: typeof prisma,
  { orgId, userId, transactionId }: { orgId: string; userId: string; transactionId: string },
): Promise<{ id: string; number: string }> {
  return withPostingLock(() =>
    prismaLike.$transaction(async (tx) => {
      const header = await tx.inventoryTransaction.findFirst({
        where: { id: transactionId, organizationId: orgId },
        include: { lines: true },
      });
      if (!header) throw notFound("Transaksi tidak ditemukan.");
      if (header.status !== "DRAFT") {
        throw conflict(`Transaksi ${header.number} berstatus ${header.status} dan tidak dapat diposting ulang.`);
      }
      await assertOrgCanTransact(tx, orgId);

      const lines: EngineLineInput[] = header.lines.map((l) => ({
        itemId: l.itemId,
        locationId: l.locationId,
        quantity: toDec(l.quantity),
        unitCost: l.unitCost ? toDec(l.unitCost) : null,
      }));
      const merged = mergeLines(lines);
      if (!merged.length) throw new AppError(400, "Transaksi tidak memiliki baris valid.");
      const { itemMap, locMap } = await loadLineRefs(tx, orgId, merged, false);

      const ignoreReservations = header.type === "CONSUMPTION" || header.type === "ADJUSTMENT";
      const { lineData, ledgerData } = await applyLines(tx, {
        orgId, userId, type: header.type as TxType, lines,
        ignoreReservations,
      }, merged, itemMap, locMap);

      // Perbarui baris yang ada (id tetap) lalu tulis ledger.
      for (const ld of lineData) {
        const match = header.lines.find(
          (l) => l.itemId === ld.itemId && l.locationId === ld.locationId,
        );
        if (match) {
          await tx.inventoryTransactionLine.update({ where: { id: match.id }, data: ld });
        } else {
          await tx.inventoryTransactionLine.create({
            data: { transactionId: header.id, ...ld },
          });
        }
      }
      for (const gl of ledgerData) {
        const lineRow = await tx.inventoryTransactionLine.findFirst({
          where: { transactionId: header.id, itemId: gl.itemId, locationId: gl.locationId },
        });
        await tx.ledgerEntry.create({
          data: {
            organizationId: orgId,
            transactionId: header.id,
            lineId: lineRow!.id,
            itemId: gl.itemId,
            locationId: gl.locationId,
            entryType: "POST",
            quantity: gl.quantity,
            unitCost: gl.unitCost,
            value: gl.value,
            runningQty: gl.runningQty,
            userId,
          },
        });
      }
      await tx.inventoryTransaction.update({
        where: { id: header.id },
        data: { status: "POSTED", postedAt: new Date(), postedById: userId },
      });
      await logAudit(tx, {
        orgId, userId,
        action: `TX_POST_${header.type}`,
        entityType: "InventoryTransaction", entityId: header.id,
        after: { number: header.number, fromDraft: true },
      });
      return { id: header.id, number: header.number };
    }),
  );
}

/** Batalkan draft (tidak berlaku untuk transaksi yang sudah diposting). */
export async function cancelDraftTransaction(
  { orgId, userId, transactionId }: { orgId: string; userId: string; transactionId: string },
): Promise<{ id: string; number: string }> {
  return prisma.$transaction(async (tx) => {
    const header = await tx.inventoryTransaction.findFirst({
      where: { id: transactionId, organizationId: orgId },
    });
    if (!header) throw notFound("Transaksi tidak ditemukan.");
    if (header.status !== "DRAFT") {
      throw conflict("Hanya transaksi berstatus DRAFT yang dapat dibatalkan. Transaksi posted dikoreksi lewat reversal.");
    }
    await tx.inventoryTransaction.update({
      where: { id: header.id },
      data: { status: "CANCELLED" },
    });
    await logAudit(tx, {
      orgId, userId, action: "TX_CANCEL",
      entityType: "InventoryTransaction", entityId: header.id,
      after: { number: header.number },
    });
    return { id: header.id, number: header.number };
  });
}

/** Reversal eksplisit transaksi posted (BR-13, PRD §9.4).
 *  Membalik setiap baris; tidak boleh menghasilkan stok negatif. */
export async function reverseTransaction(
  { orgId, userId, transactionId, reason }: {
    orgId: string; userId: string; transactionId: string; reason?: string;
  },
): Promise<{ id: string; number: string }> {
  return withPostingLock(() =>
    prisma.$transaction(async (tx) => {
      const original = await tx.inventoryTransaction.findFirst({
        where: { id: transactionId, organizationId: orgId },
        include: { lines: true, reversals: true },
      });
      if (!original) throw notFound("Transaksi tidak ditemukan.");
      if (original.status !== "POSTED") {
        throw conflict(`Hanya transaksi POSTED yang dapat di-reverse (status saat ini: ${original.status}).`);
      }
      if (original.reversals.length > 0) {
        throw conflict(`Transaksi ${original.number} sudah pernah di-reverse (${original.reversals[0].number}).`);
      }

      const revLines: EngineLineInput[] = original.lines.map((l) => {
        const qty = toDec(l.quantity);
        let cost = l.unitCost ? toDec(l.unitCost) : null;
        if (!cost && qty.lt(0)) {
          // Baris keluar yang dinilai dengan avg cost: pulihkan nilai persis
          // dari value historis agar valuasi kembali konsisten.
          const v = toDec(l.value);
          if (!v.eq(0)) cost = v.div(qty.abs());
        }
        return {
          itemId: l.itemId,
          locationId: l.locationId,
          quantity: qty.neg(),
          unitCost: cost,
        };
      });

      const reversal = await postTransactionWithinTx(tx, {
        orgId,
        userId,
        type: "REVERSAL",
        notes: `Reversal dari ${original.number}${reason ? ` — ${reason}` : ""}`,
        reason: reason ?? null,
        refType: "PARENT_TX",
        refId: original.id,
        refNumber: original.number,
        lines: revLines,
        ignoreReservations: true,
        allowInactiveItems: true,
      });

      await tx.inventoryTransaction.update({
        where: { id: original.id },
        data: { status: "REVERSED" },
      });
      await logAudit(tx, {
        orgId, userId, action: "TX_REVERSE",
        entityType: "InventoryTransaction", entityId: original.id,
        after: { number: original.number, reversalNumber: reversal.number },
        reason,
      });
      return reversal;
    }),
  );
}
