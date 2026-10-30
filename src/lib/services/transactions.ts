// Layanan transaksi stok operasional: receiving, issue, transfer,
// adjustment, saldo awal (PRD §9-§12, §17.4).
import { prisma } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { Decimal, toDec } from "@/lib/decimal";
import {
  createAndPostTransaction, createDraftTransaction, postDraftTransaction,
  cancelDraftTransaction, reverseTransaction, postTransactionWithinTx,
  withPostingLock, type EngineLineInput,
} from "@/lib/inventory/engine";
import { convertToBaseUnit } from "@/lib/inventory/uom";
import { ISSUE_TYPES } from "@/lib/constants";

type Ctx = { org: { id: string }; user: { id: string } };

export interface TxLineInput {
  itemId: string;
  locationId: string;
  quantity: string; // positif
  uomId?: string; // bila berbeda dari base unit
  unitCost?: string | null;
  notes?: string | null;
}

async function baseLines(
  orgId: string,
  lines: TxLineInput[],
  sign: 1 | -1,
  defaultCostFallback = false,
): Promise<EngineLineInput[]> {
  const out: EngineLineInput[] = [];
  for (const l of lines) {
    let qty = toDec(l.quantity);
    if (qty.lte(0)) throw badRequest("Kuantitas harus lebih besar dari nol (BR-06).");
    if (l.uomId) qty = await convertToBaseUnit(prisma, orgId, l.itemId, l.uomId, qty);
    let cost: Decimal | null = null;
    if (l.unitCost !== undefined && l.unitCost !== null && l.unitCost !== "") {
      cost = toDec(l.unitCost);
      if (cost.lt(0)) throw badRequest("Biaya satuan tidak boleh negatif.");
    } else if (defaultCostFallback) {
      const item = await prisma.item.findUnique({ where: { id: l.itemId }, select: { defaultCost: true } });
      cost = item?.defaultCost ? toDec(item.defaultCost) : null;
    }
    out.push({
      itemId: l.itemId,
      locationId: l.locationId,
      quantity: qty.times(sign),
      unitCost: cost,
      notes: l.notes ?? null,
    });
  }
  return out;
}

// ---------- Penerimaan (PRD §9) ----------

export interface ReceiptInput {
  supplierId?: string | null;
  reference?: string | null;
  date?: string;
  notes?: string | null;
  lines: TxLineInput[];
}

export async function createReceipt(ctx: Ctx, input: ReceiptInput, mode: "draft" | "post") {
  const lines = await baseLines(ctx.org.id, input.lines, 1, true);
  const common = {
    orgId: ctx.org.id,
    userId: ctx.user.id,
    type: "RECEIPT" as const,
    date: input.date ? new Date(input.date) : new Date(),
    notes: input.notes ?? null,
    reference: input.reference ?? null,
    reason: input.supplierId ? `supplier:${input.supplierId}` : "direct-receiving",
    lines,
  };
  if (mode === "post") return createAndPostTransaction(common);
  return createDraftTransaction(common);
}

// ---------- Pengeluaran (PRD §10) ----------

export interface IssueInput {
  issueType: string;
  destination?: string | null;
  reference?: string | null;
  date?: string;
  notes?: string | null;
  lines: TxLineInput[];
}

export async function createIssue(ctx: Ctx, input: IssueInput, mode: "draft" | "post") {
  if (!ISSUE_TYPES.includes(input.issueType as never)) {
    throw badRequest("Jenis pengeluaran tidak valid.");
  }
  const lines = await baseLines(ctx.org.id, input.lines, -1);
  const notes = [input.notes, input.destination ? `Tujuan: ${input.destination}` : null]
    .filter(Boolean).join(" — ") || null;
  const common = {
    orgId: ctx.org.id,
    userId: ctx.user.id,
    type: "ISSUE" as const,
    date: input.date ? new Date(input.date) : new Date(),
    notes,
    reference: input.reference ?? null,
    reason: `issue-type:${input.issueType}`,
    lines,
  };
  if (mode === "post") return createAndPostTransaction(common);
  return createDraftTransaction(common);
}

// ---------- Transfer internal satu tahap (PRD §11) ----------

export interface TransferInput {
  date?: string;
  notes?: string | null;
  lines: (TxLineInput & { toLocationId: string })[];
}

export async function createTransfer(ctx: Ctx, input: TransferInput, mode: "draft" | "post") {
  const engineLines: EngineLineInput[] = [];
  for (const l of input.lines) {
    if (l.locationId === l.toLocationId) {
      throw badRequest("Lokasi asal dan tujuan transfer harus berbeda (PRD §11.3).");
    }
    let qty = toDec(l.quantity);
    if (qty.lte(0)) throw badRequest("Kuantitas transfer harus lebih besar dari nol.");
    if (l.uomId) qty = await convertToBaseUnit(prisma, ctx.org.id, l.itemId, l.uomId, qty);

    // Baris keluar dinilai avg cost; baris masuk membawa cost yang sama agar
    // total nilai persediaan organisasi tidak berubah (PRD §11.3).
    const item = await prisma.item.findUnique({
      where: { id: l.itemId },
      select: { avgCost: true, organizationId: true },
    });
    if (!item || item.organizationId !== ctx.org.id) throw notFound("Item tidak ditemukan.");
    const avg = toDec(item.avgCost);
    engineLines.push({
      itemId: l.itemId, locationId: l.locationId,
      quantity: qty.neg(), unitCost: null, notes: l.notes ?? null,
    });
    engineLines.push({
      itemId: l.itemId, locationId: l.toLocationId,
      quantity: qty, unitCost: avg.gt(0) ? avg : null,
    });
  }
  const common = {
    orgId: ctx.org.id,
    userId: ctx.user.id,
    type: "TRANSFER" as const,
    date: input.date ? new Date(input.date) : new Date(),
    notes: input.notes ?? null,
    lines: engineLines,
  };
  if (mode === "post") return createAndPostTransaction(common);
  return createDraftTransaction(common);
}

// ---------- Penyesuaian (PRD §12.1) ----------

export interface AdjustmentInput {
  reason: string;
  date?: string;
  notes?: string | null;
  lines: { itemId: string; locationId: string; newQty: string }[]; // set ke jumlah fisik absolut
}

export async function createAdjustment(ctx: Ctx, input: AdjustmentInput, mode: "draft" | "post") {
  if (!input.reason?.trim()) throw badRequest("Alasan penyesuaian wajib diisi.");
  const engineLines: EngineLineInput[] = [];
  for (const l of input.lines) {
    const balance = await prisma.stockBalance.findUnique({
      where: { itemId_locationId: { itemId: l.itemId, locationId: l.locationId } },
    });
    const current = toDec(balance?.onHand);
    const target = toDec(l.newQty);
    if (target.lt(0)) throw badRequest("Jumlah baru tidak boleh negatif.");
    const delta = target.minus(current);
    if (delta.eq(0)) continue;
    engineLines.push({ itemId: l.itemId, locationId: l.locationId, quantity: delta });
  }
  if (!engineLines.length) {
    throw badRequest("Tidak ada selisih untuk disesuaikan (jumlah baru sama dengan stok sistem).");
  }
  const common = {
    orgId: ctx.org.id,
    userId: ctx.user.id,
    type: "ADJUSTMENT" as const,
    date: input.date ? new Date(input.date) : new Date(),
    notes: input.notes ?? null,
    reason: input.reason,
    lines: engineLines,
  };
  if (mode === "post") return createAndPostTransaction(common);
  return createDraftTransaction(common);
}

// ---------- Saldo awal (PRD §17.4) ----------
// Diproses sebagai transaksi OPENING yang dapat ditelusuri.

export interface OpeningInput {
  date?: string;
  reference?: string | null;
  notes?: string | null;
  lines: TxLineInput[];
}

export async function createOpeningStock(ctx: Ctx, input: OpeningInput) {
  const lines = await baseLines(ctx.org.id, input.lines, 1, true);
  return createAndPostTransaction({
    orgId: ctx.org.id,
    userId: ctx.user.id,
    type: "OPENING",
    date: input.date ? new Date(input.date) : new Date(),
    notes: input.notes ?? "Saldo awal",
    reference: input.reference ?? null,
    lines,
  });
}

// ---------- Aksi umum transaksi ----------

export async function postTx(ctx: Ctx, transactionId: string) {
  return postDraftTransaction(prisma, { orgId: ctx.org.id, userId: ctx.user.id, transactionId });
}

export async function cancelTx(ctx: Ctx, transactionId: string) {
  return cancelDraftTransaction({ orgId: ctx.org.id, userId: ctx.user.id, transactionId });
}

export async function reverseTx(ctx: Ctx, transactionId: string, reason?: string) {
  return reverseTransaction({ orgId: ctx.org.id, userId: ctx.user.id, transactionId, reason });
}

export async function getTransactionDetail(orgId: string, transactionId: string) {
  const tx = await prisma.inventoryTransaction.findFirst({
    where: { id: transactionId, organizationId: orgId },
    include: {
      lines: { include: { item: { include: { baseUom: true } }, location: true } },
      reversalOf: true,
      reversals: true,
      createdBy: { select: { name: true } },
      postedBy: { select: { name: true } },
    },
  });
  return tx;
}

export async function listTransactions(
  orgId: string,
  filters: { type?: string; status?: string; q?: string; page?: number; pageSize?: number },
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 20);
  const where = {
    organizationId: orgId,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? { number: { contains: filters.q } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.inventoryTransaction.count({ where }),
    prisma.inventoryTransaction.findMany({
      where,
      include: {
        createdBy: { select: { name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pageSize, rows };
}

// Dipakai service pembelian untuk posting receipt PO secara atomik.
export { postTransactionWithinTx, withPostingLock, conflict };
