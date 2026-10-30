// Layanan purchase order + penerimaan terhubung PO (PRD §9).
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { toDec } from "@/lib/decimal";
import { nextDocNumber } from "@/lib/numbering";
import {
  postTransactionWithinTx, withPostingLock, type EngineLineInput,
} from "@/lib/inventory/engine";

type Ctx = { org: { id: string }; user: { id: string } };

export interface POLineInput {
  itemId: string;
  orderedQty: string;
  unitPrice: string;
  notes?: string | null;
}

export interface POInput {
  supplierId: string;
  orderDate?: string;
  expectedDate?: string | null;
  destinationWarehouseId?: string | null;
  notes?: string | null;
  submit?: boolean;
  lines: POLineInput[];
}

export async function createPurchaseOrder(ctx: Ctx, input: POInput) {
  if (!input.lines.length) throw badRequest("PO harus memiliki minimal satu baris.");
  for (const l of input.lines) {
    if (toDec(l.orderedQty).lte(0)) throw badRequest("Kuantitas pesanan harus lebih besar dari nol.");
    if (toDec(l.unitPrice).lt(0)) throw badRequest("Harga satuan tidak boleh negatif.");
  }
  const submit = input.submit ?? false;
  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, organizationId: ctx.org.id },
    });
    if (!supplier) throw badRequest("Supplier tidak ditemukan.");

    const number = await nextDocNumber(tx, ctx.org.id, "PO", input.orderDate ? new Date(input.orderDate) : undefined);
    const po = await tx.purchaseOrder.create({
      data: {
        organizationId: ctx.org.id,
        number,
        supplierId: input.supplierId,
        orderDate: input.orderDate ? new Date(input.orderDate) : new Date(),
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        destinationWarehouseId: input.destinationWarehouseId || null,
        status: submit ? "SUBMITTED" : "DRAFT",
        notes: input.notes || null,
        createdById: ctx.user.id,
        lines: {
          create: input.lines.map((l) => ({
            itemId: l.itemId,
            orderedQty: toDec(l.orderedQty).toString(),
            unitPrice: toDec(l.unitPrice).toString(),
            notes: l.notes || null,
          })),
        },
      },
      include: { lines: true },
    });
    await logAudit(tx, {
      orgId: ctx.org.id, userId: ctx.user.id,
      action: "PO_CREATE", entityType: "PurchaseOrder", entityId: po.id,
      after: { number, supplier: supplier.name, lines: input.lines.length },
    });
    return po;
  });
}

async function getPO(orgId: string, poId: string) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: poId, organizationId: orgId },
    include: {
      supplier: true,
      lines: { include: { item: { include: { baseUom: true } } } },
    },
  });
  if (!po) throw notFound("Purchase order tidak ditemukan.");
  return po;
}

export async function approvePO(ctx: Ctx, poId: string) {
  const po = await getPO(ctx.org.id, poId);
  if (po.status !== "SUBMITTED") {
    throw conflict(`PO ${po.number} berstatus ${po.status} dan tidak dapat disetujui.`);
  }
  const updated = await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: "APPROVED", approvedById: ctx.user.id, approvedAt: new Date() },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "PO_APPROVE", entityType: "PurchaseOrder", entityId: po.id,
    after: { number: po.number },
  });
  return updated;
}

export async function submitPO(ctx: Ctx, poId: string) {
  const po = await getPO(ctx.org.id, poId);
  if (po.status !== "DRAFT") throw conflict(`PO ${po.number} berstatus ${po.status} dan tidak dapat disubmit.`);
  const updated = await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: "SUBMITTED" },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "PO_SUBMIT", entityType: "PurchaseOrder", entityId: po.id,
  });
  return updated;
}

export async function cancelPO(ctx: Ctx, poId: string) {
  const po = await getPO(ctx.org.id, poId);
  if (!["DRAFT", "SUBMITTED", "APPROVED"].includes(po.status)) {
    throw conflict(`PO ${po.number} berstatus ${po.status} dan tidak dapat dibatalkan.`);
  }
  // Kasus tepi §24.10: PO yang sudah menerima sebagian tidak boleh dibatalkan begitu saja
  const hasReceipts = po.lines.some((l) => toDec(l.receivedQty).gt(0));
  if (hasReceipts) {
    throw conflict(
      "PO sudah memiliki penerimaan barang. Selesaikan sisa penerimaan atau lakukan pengembalian (issue) secara terpisah.",
    );
  }
  const updated = await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: "CANCELLED" },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "PO_CANCEL", entityType: "PurchaseOrder", entityId: po.id,
  });
  return updated;
}

export interface ReceiveInput {
  locationId: string;
  date?: string;
  reference?: string | null;
  notes?: string | null;
  lines: { poLineId: string; receivedQty: string; unitCost?: string | null }[];
}

/** Terima barang atas PO: partial receiving + update status PO + posting stok
 *  dalam SATU transaksi database (PRD §9.3-§9.4, Workflow B §20.2). */
export async function receivePurchaseOrder(ctx: Ctx, poId: string, input: ReceiveInput) {
  return withPostingLock(() =>
    prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id: poId, organizationId: ctx.org.id },
        include: { lines: { include: { item: true } }, supplier: true },
      });
      if (!po) throw notFound("Purchase order tidak ditemukan.");
      if (!["SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED"].includes(po.status)) {
        throw conflict(`PO ${po.number} berstatus ${po.status} dan tidak dapat menerima barang.`);
      }
      const location = await tx.storageLocation.findFirst({
        where: { id: input.locationId, organizationId: ctx.org.id, isActive: true },
      });
      if (!location) throw badRequest("Lokasi tujuan tidak valid atau nonaktif.");

      const engineLines: EngineLineInput[] = [];
      const receivedUpdates: { id: string; add: ReturnType<typeof toDec> }[] = [];
      for (const rl of input.lines) {
        const poLine = po.lines.find((l) => l.id === rl.poLineId);
        if (!poLine) throw badRequest("Baris PO tidak ditemukan.");
        const qty = toDec(rl.receivedQty);
        if (qty.lte(0)) continue;
        // Validasi over-receiving (PRD §9.4): tidak boleh melebihi sisa pesanan
        const remaining = toDec(poLine.orderedQty).minus(toDec(poLine.receivedQty));
        if (qty.gt(remaining)) {
          throw conflict(
            `Penerimaan untuk ${poLine.item.code} (${qty.toFixed(4)}) melebihi sisa pesanan (${remaining.toFixed(4)}). Over-receiving tidak diizinkan.`,
          );
        }
        const cost = rl.unitCost !== undefined && rl.unitCost !== null && rl.unitCost !== ""
          ? toDec(rl.unitCost)
          : toDec(poLine.unitPrice);
        engineLines.push({
          itemId: poLine.itemId,
          locationId: input.locationId,
          quantity: qty,
          unitCost: cost,
        });
        receivedUpdates.push({ id: poLine.id, add: qty });
      }
      if (!engineLines.length) throw badRequest("Tidak ada kuantitas penerimaan yang valid (lebih besar dari nol).");

      // Posting stok lewat inventory engine dalam transaksi yang sama
      const posted = await postTransactionWithinTx(tx, {
        orgId: ctx.org.id,
        userId: ctx.user.id,
        type: "RECEIPT",
        date: input.date ? new Date(input.date) : new Date(),
        notes: input.notes ?? null,
        reference: input.reference ?? null,
        reason: `supplier:${po.supplierId}`,
        refType: "PURCHASE_ORDER",
        refId: po.id,
        refNumber: po.number,
        lines: engineLines,
      });

      // Update progres penerimaan PO + status
      for (const ru of receivedUpdates) {
        const line = po.lines.find((l) => l.id === ru.id)!;
        await tx.purchaseOrderLine.update({
          where: { id: ru.id },
          data: { receivedQty: toDec(line.receivedQty).plus(ru.add).toString() },
        });
      }
      const refreshed = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
      const fullyReceived = refreshed.every((l) => toDec(l.receivedQty).gte(toDec(l.orderedQty)));
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
      });
      await logAudit(tx, {
        orgId: ctx.org.id, userId: ctx.user.id,
        action: "PO_RECEIVE", entityType: "PurchaseOrder", entityId: po.id,
        after: { receiptNumber: posted.number, lines: engineLines.length },
      });
      return posted;
    }),
  );
}

export async function listPurchaseOrders(
  orgId: string,
  filters: { status?: string; page?: number } = {},
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = 20;
  const where = {
    organizationId: orgId,
    ...(filters.status ? { status: filters.status } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: true,
        lines: true,
      },
      orderBy: { orderDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pageSize, rows };
}

export async function getPurchaseOrder(orgId: string, poId: string) {
  const po = await getPO(orgId, poId);
  const receipts = await prisma.inventoryTransaction.findMany({
    where: { organizationId: orgId, refType: "PURCHASE_ORDER", refId: poId },
    include: { lines: true },
    orderBy: { postedAt: "desc" },
  });
  return { po, receipts };
}
