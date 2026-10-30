// Layanan item master (PRD §6) dengan enforcement batas paket (PRD §19.2).
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { ITEM_TYPES, type ItemType } from "@/lib/constants";
import { toDec, storeQty, storeCost } from "@/lib/decimal";

export interface ItemInput {
  code: string;
  name: string;
  type: string;
  baseUomId: string;
  categoryId?: string | null;
  description?: string | null;
  barcode?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  defaultSupplierId?: string | null;
  minStock?: string | null;
  reorderQty?: string | null;
  defaultCost?: string | null;
  notes?: string | null;
}

function validateType(type: string): ItemType {
  if (!ITEM_TYPES.includes(type as ItemType)) {
    throw badRequest("Tipe item tidak valid.");
  }
  return type as ItemType;
}

async function assertItemLimit(org: { id: string; maxItems: number | null }) {
  if (org.maxItems === null) return;
  const count = await prisma.item.count({ where: { organizationId: org.id } });
  if (count + 1 > org.maxItems) {
    throw forbidden(
      `Batas item paket (${org.maxItems}) telah tercapai. Nonaktifkan item tidak terpakai atau upgrade paket.`,
    );
  }
}

export async function createItem(
  ctx: { org: { id: string; maxItems: number | null }; user: { id: string } },
  input: ItemInput,
) {
  validateType(input.type);
  await assertItemLimit(ctx.org);
  const code = input.code.trim().toUpperCase();
  const dup = await prisma.item.findFirst({ where: { organizationId: ctx.org.id, code } });
  if (dup) throw conflict(`SKU "${code}" sudah digunakan oleh item lain di organisasi ini.`);

  const uom = await prisma.unitOfMeasure.findFirst({
    where: { id: input.baseUomId, organizationId: ctx.org.id },
  });
  if (!uom) throw badRequest("Satuan dasar tidak ditemukan di organisasi ini.");

  const item = await prisma.item.create({
    data: {
      organizationId: ctx.org.id,
      code,
      name: input.name.trim(),
      type: input.type,
      baseUomId: input.baseUomId,
      categoryId: input.categoryId || null,
      description: input.description || null,
      barcode: input.barcode || null,
      brand: input.brand || null,
      manufacturer: input.manufacturer || null,
      defaultSupplierId: input.defaultSupplierId || null,
      minStock: input.minStock ? storeQty(input.minStock) : null,
      reorderQty: input.reorderQty ? storeQty(input.reorderQty) : null,
      defaultCost: input.defaultCost ? storeCost(input.defaultCost) : null,
      notes: input.notes || null,
    },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "ITEM_CREATE", entityType: "Item", entityId: item.id,
    after: { code, name: item.name, type: item.type },
  });
  return item;
}

export async function updateItem(
  ctx: { org: { id: string }; user: { id: string } },
  itemId: string,
  input: Partial<ItemInput>,
) {
  const item = await prisma.item.findFirst({ where: { id: itemId, organizationId: ctx.org.id } });
  if (!item) throw notFound("Item tidak ditemukan.");
  if (input.type) validateType(input.type);

  // SKU tidak boleh bentrok dengan item lain
  if (input.code && input.code.trim().toUpperCase() !== item.code) {
    const code = input.code.trim().toUpperCase();
    const dup = await prisma.item.findFirst({
      where: { organizationId: ctx.org.id, code, id: { not: item.id } },
    });
    if (dup) throw conflict(`SKU "${code}" sudah digunakan oleh item lain.`);
  }

  // Perubahan base unit dibatasi bila item sudah bertransaksi (PRD §6.3)
  if (input.baseUomId && input.baseUomId !== item.baseUomId) {
    const hasTx = await prisma.inventoryTransactionLine.findFirst({
      where: { itemId: item.id },
    });
    if (hasTx) {
      throw badRequest(
        "Satuan dasar tidak dapat diubah karena item sudah memiliki transaksi. " +
        "Buat item baru atau lakukan penyesuaian stok bertahap.",
      );
    }
  }

  const updated = await prisma.item.update({
    where: { id: item.id },
    data: {
      ...(input.code ? { code: input.code.trim().toUpperCase() } : {}),
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.baseUomId ? { baseUomId: input.baseUomId } : {}),
      categoryId: input.categoryId !== undefined ? input.categoryId || null : undefined,
      description: input.description !== undefined ? input.description || null : undefined,
      barcode: input.barcode !== undefined ? input.barcode || null : undefined,
      brand: input.brand !== undefined ? input.brand || null : undefined,
      manufacturer: input.manufacturer !== undefined ? input.manufacturer || null : undefined,
      defaultSupplierId: input.defaultSupplierId !== undefined ? input.defaultSupplierId || null : undefined,
      minStock: input.minStock !== undefined ? (input.minStock ? storeQty(input.minStock) : null) : undefined,
      reorderQty: input.reorderQty !== undefined ? (input.reorderQty ? storeQty(input.reorderQty) : null) : undefined,
      defaultCost: input.defaultCost !== undefined ? (input.defaultCost ? storeCost(input.defaultCost) : null) : undefined,
      notes: input.notes !== undefined ? input.notes || null : undefined,
    },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "ITEM_UPDATE", entityType: "Item", entityId: item.id,
    before: { code: item.code, name: item.name, minStock: item.minStock },
    after: { code: updated.code, name: updated.name, minStock: updated.minStock },
  });
  return updated;
}

/** Nonaktifkan (bukan hapus) — histori transaksi tetap utuh (PRD §6.3). */
export async function setItemActive(
  ctx: { org: { id: string }; user: { id: string } },
  itemId: string,
  isActive: boolean,
) {
  const item = await prisma.item.findFirst({ where: { id: itemId, organizationId: ctx.org.id } });
  if (!item) throw notFound("Item tidak ditemukan.");
  const updated = await prisma.item.update({
    where: { id: item.id },
    data: { isActive },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: isActive ? "ITEM_ACTIVATE" : "ITEM_DEACTIVATE",
    entityType: "Item", entityId: item.id,
  });
  return updated;
}

/** Hapus permanen hanya bila belum pernah dipakai transaksi mana pun. */
export async function deleteItemIfUnused(
  ctx: { org: { id: string }; user: { id: string } },
  itemId: string,
) {
  const item = await prisma.item.findFirst({ where: { id: itemId, organizationId: ctx.org.id } });
  if (!item) throw notFound("Item tidak ditemukan.");
  const used = await prisma.inventoryTransactionLine.findFirst({ where: { itemId: item.id } });
  if (used) {
    throw conflict(
      "Item sudah digunakan dalam transaksi dan tidak dapat dihapus. Nonaktifkan item sebagai gantinya.",
    );
  }
  const balance = await prisma.stockBalance.findFirst({
    where: { itemId: item.id, onHand: { not: "0.0000" } },
  });
  if (balance && toDec(balance.onHand).gt(0)) {
    throw conflict("Item masih memiliki stok dan tidak dapat dihapus.");
  }
  await prisma.item.delete({ where: { id: item.id } });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "ITEM_DELETE", entityType: "Item", entityId: item.id,
    before: { code: item.code, name: item.name },
  });
}

export async function listItems(
  orgId: string,
  filters: { q?: string; type?: string; categoryId?: string; active?: string } = {},
) {
  return prisma.item.findMany({
    where: {
      organizationId: orgId,
      ...(filters.q
        ? { OR: [{ code: { contains: filters.q } }, { name: { contains: filters.q } }] }
        : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.active === "true" ? { isActive: true } : filters.active === "false" ? { isActive: false } : {}),
    },
    include: { category: true, baseUom: true },
    orderBy: { code: "asc" },
  });
}
