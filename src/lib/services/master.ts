// Layanan master data lain: kategori, satuan+konversi, warehouse+lokasi,
// supplier, customer (PRD §6.4-§6.6, §7).
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { LOCATION_TYPES, type LocationType } from "@/lib/constants";
import { toDec } from "@/lib/decimal";


type Ctx = { org: { id: string; maxWarehouses: number | null }; user: { id: string } };

// ---------- Kategori ----------

export async function createCategory(ctx: Ctx, name: string, description?: string) {
  const dup = await prisma.itemCategory.findFirst({
    where: { organizationId: ctx.org.id, name: name.trim() },
  });
  if (dup) throw conflict("Kategori dengan nama tersebut sudah ada.");
  const cat = await prisma.itemCategory.create({
    data: { organizationId: ctx.org.id, name: name.trim(), description: description || null },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "CATEGORY_CREATE", entityType: "ItemCategory", entityId: cat.id, after: { name: cat.name },
  });
  return cat;
}

export async function deleteCategory(ctx: Ctx, id: string) {
  const cat = await prisma.itemCategory.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!cat) throw notFound("Kategori tidak ditemukan.");
  const used = await prisma.item.count({ where: { categoryId: id } });
  if (used > 0) {
    throw conflict(
      `Kategori masih dipakai oleh ${used} item. Pindahkan item ke kategori lain sebelum menghapus.`,
    );
  }
  await prisma.itemCategory.delete({ where: { id } });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "CATEGORY_DELETE", entityType: "ItemCategory", entityId: id, before: { name: cat.name },
  });
}

// ---------- Satuan & konversi ----------

export async function createUom(ctx: Ctx, code: string, name: string) {
  const c = code.trim().toLowerCase();
  const dup = await prisma.unitOfMeasure.findFirst({ where: { organizationId: ctx.org.id, code: c } });
  if (dup) throw conflict("Kode satuan sudah digunakan.");
  const uom = await prisma.unitOfMeasure.create({
    data: { organizationId: ctx.org.id, code: c, name: name.trim() },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "UOM_CREATE", entityType: "UnitOfMeasure", entityId: uom.id, after: { code: c },
  });
  return uom;
}

export async function createUomConversion(
  ctx: Ctx,
  fromUomId: string,
  toUomId: string,
  factor: string,
) {
  if (fromUomId === toUomId) throw badRequest("Satuan asal dan tujuan tidak boleh sama.");
  const f = toDec(factor);
  if (f.lte(0)) throw badRequest("Faktor konversi harus lebih besar dari nol.");
  const dup = await prisma.uomConversion.findFirst({
    where: { organizationId: ctx.org.id, fromUomId, toUomId },
  });
  if (dup) throw conflict("Konversi untuk pasangan satuan tersebut sudah ada.");
  const conv = await prisma.uomConversion.create({
    data: { organizationId: ctx.org.id, fromUomId, toUomId, factor: f.toString() },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "UOM_CONVERSION_CREATE", entityType: "UomConversion", entityId: conv.id,
    after: { fromUomId, toUomId, factor: factor },
  });
  return conv;
}

// ---------- Warehouse & lokasi ----------

export async function createWarehouse(ctx: Ctx, code: string, name: string, address?: string, manager?: string) {
  if (ctx.org.maxWarehouses !== null) {
    const count = await prisma.warehouse.count({ where: { organizationId: ctx.org.id } });
    if (count + 1 > ctx.org.maxWarehouses) {
      throw forbidden(
        `Batas gudang paket (${ctx.org.maxWarehouses}) telah tercapai. Upgrade paket untuk menambah gudang.`,
      );
    }
  }
  const c = code.trim().toUpperCase();
  const dup = await prisma.warehouse.findFirst({ where: { organizationId: ctx.org.id, code: c } });
  if (dup) throw conflict("Kode gudang sudah digunakan.");
  const wh = await prisma.warehouse.create({
    data: { organizationId: ctx.org.id, code: c, name: name.trim(), address: address || null, manager: manager || null },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "WAREHOUSE_CREATE", entityType: "Warehouse", entityId: wh.id, after: { code: c, name },
  });
  return wh;
}

export async function createLocation(
  ctx: Ctx,
  warehouseId: string,
  code: string,
  name: string,
  type: string,
) {
  if (!LOCATION_TYPES.includes(type as LocationType)) throw badRequest("Tipe lokasi tidak valid.");
  const wh = await prisma.warehouse.findFirst({
    where: { id: warehouseId, organizationId: ctx.org.id },
  });
  if (!wh) throw notFound("Gudang tidak ditemukan.");
  const c = code.trim().toUpperCase();
  const dup = await prisma.storageLocation.findFirst({ where: { organizationId: ctx.org.id, code: c } });
  if (dup) throw conflict("Kode lokasi sudah digunakan di organisasi ini.");
  const loc = await prisma.storageLocation.create({
    data: { organizationId: ctx.org.id, warehouseId, code: c, name: name.trim(), type },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "LOCATION_CREATE", entityType: "StorageLocation", entityId: loc.id,
    after: { code: c, warehouseId },
  });
  return loc;
}

export async function setWarehouseActive(ctx: Ctx, id: string, isActive: boolean) {
  const wh = await prisma.warehouse.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!wh) throw notFound("Gudang tidak ditemukan.");
  if (!isActive) {
    // Warehouse dengan stok tidak boleh dinonaktifkan diam-diam (kasus tepi §24.8)
    const locations = await prisma.storageLocation.findMany({
      where: { warehouseId: id }, select: { id: true },
    });
    const withStock = await prisma.stockBalance.findFirst({
      where: { locationId: { in: locations.map((l) => l.id) }, onHand: { not: "0.0000" } },
    });
    const hasStock = !!withStock && toDec(withStock.onHand).gt(0);
    if (hasStock) {
      throw conflict("Gudang masih memiliki stok dan tidak dapat dinonaktifkan.");
    }
  }
  const updated = await prisma.warehouse.update({ where: { id }, data: { isActive } });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: isActive ? "WAREHOUSE_ACTIVATE" : "WAREHOUSE_DEACTIVATE",
    entityType: "Warehouse", entityId: id,
  });
  return updated;
}

export async function setLocationActive(ctx: Ctx, id: string, isActive: boolean) {
  const loc = await prisma.storageLocation.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!loc) throw notFound("Lokasi tidak ditemukan.");
  const updated = await prisma.storageLocation.update({ where: { id }, data: { isActive } });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: isActive ? "LOCATION_ACTIVATE" : "LOCATION_DEACTIVATE",
    entityType: "StorageLocation", entityId: id,
  });
  return updated;
}

// ---------- Supplier & Customer ----------

export interface PartnerInput {
  code: string; name: string; contactPerson?: string; phone?: string;
  email?: string; address?: string; taxId?: string; notes?: string;
}

export async function createSupplier(ctx: Ctx, input: PartnerInput) {
  const code = input.code.trim().toUpperCase();
  const dup = await prisma.supplier.findFirst({ where: { organizationId: ctx.org.id, code } });
  if (dup) throw conflict("Kode supplier sudah digunakan.");
  const s = await prisma.supplier.create({
    data: {
      organizationId: ctx.org.id, code, name: input.name.trim(),
      contactPerson: input.contactPerson || null, phone: input.phone || null,
      email: input.email || null, address: input.address || null,
      taxId: input.taxId || null, notes: input.notes || null,
    },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "SUPPLIER_CREATE", entityType: "Supplier", entityId: s.id, after: { code, name: input.name },
  });
  return s;
}

export async function createCustomer(ctx: Ctx, input: PartnerInput) {
  const code = input.code.trim().toUpperCase();
  const dup = await prisma.customer.findFirst({ where: { organizationId: ctx.org.id, code } });
  if (dup) throw conflict("Kode customer sudah digunakan.");
  const c = await prisma.customer.create({
    data: {
      organizationId: ctx.org.id, code, name: input.name.trim(),
      contactPerson: input.contactPerson || null, phone: input.phone || null,
      email: input.email || null, address: input.address || null, notes: input.notes || null,
    },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "CUSTOMER_CREATE", entityType: "Customer", entityId: c.id, after: { code, name: input.name },
  });
  return c;
}

export async function setSupplierActive(ctx: Ctx, id: string, isActive: boolean) {
  const s = await prisma.supplier.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!s) throw notFound("Supplier tidak ditemukan.");
  const updated = await prisma.supplier.update({ where: { id }, data: { isActive } });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: isActive ? "SUPPLIER_ACTIVATE" : "SUPPLIER_DEACTIVATE",
    entityType: "Supplier", entityId: id,
  });
  return updated;
}

export async function setCustomerActive(ctx: Ctx, id: string, isActive: boolean) {
  const c = await prisma.customer.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!c) throw notFound("Customer tidak ditemukan.");
  const updated = await prisma.customer.update({ where: { id }, data: { isActive } });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: isActive ? "CUSTOMER_ACTIVATE" : "CUSTOMER_DEACTIVATE",
    entityType: "Customer", entityId: id,
  });
  return updated;
}
