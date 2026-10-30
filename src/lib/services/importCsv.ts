// Layanan import CSV: items & saldo awal (PRD §17) + export CSV (PRD §16.6).
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/errors";
import { toDec, storeQty, storeCost } from "@/lib/decimal";
import { ITEM_TYPES } from "@/lib/constants";
import { createOpeningStock } from "@/lib/services/transactions";

type Ctx = { org: { id: string; maxItems: number | null }; user: { id: string } };

// ---------- Template & parsing ----------

export const ITEM_TEMPLATE_HEADER = "code,name,type,base_uom,category,min_stock,reorder_qty,default_cost,notes";
export const OPENING_TEMPLATE_HEADER = "item_code,location_code,quantity,unit_cost";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n") {
      row.push(field.trim());
      if (row.some((c) => c !== "")) rows.push(row);
      row = []; field = "";
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

function idxMap(header: string[]): Map<string, number> {
  const m = new Map<string, number>();
  header.forEach((h, i) => m.set(h.trim().toLowerCase(), i));
  return m;
}

// ---------- Validasi import item ----------

export interface ItemRowData {
  code: string; name: string; type: string; baseUomCode: string;
  categoryName?: string; minStock?: string; reorderQty?: string;
  defaultCost?: string; notes?: string;
}

/** Validasi CSV item: struktur + isi + duplikat (PRD §17.2-§17.3). */
export async function validateItemsCsv(ctx: Ctx, csvText: string) {
  const rows = parseCsv(csvText);
  if (!rows.length) throw badRequest("File CSV kosong.");
  const header = rows[0].map((h) => h.toLowerCase());
  const idx = idxMap(header);
  for (const req of ["code", "name", "type", "base_uom"]) {
    if (!idx.has(req)) throw badRequest(`Kolom wajib "${req}" tidak ditemukan pada header CSV.`);
  }

  const uoms = await prisma.unitOfMeasure.findMany({ where: { organizationId: ctx.org.id } });
  const uomByCode = new Map(uoms.map((u) => [u.code, u.id]));
  const categories = await prisma.itemCategory.findMany({ where: { organizationId: ctx.org.id } });
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const existingCodes = new Set(
    (await prisma.item.findMany({ where: { organizationId: ctx.org.id }, select: { code: true } })).map((i) => i.code),
  );

  const errors: { row: number; message: string }[] = [];
  const valid: (ItemRowData & { categoryId?: string; baseUomId: string })[] = [];
  const seenCodes = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (col: string) => { const i = idx.get(col); return i === undefined ? "" : (row[i] ?? ""); };
    const code = get("code").toUpperCase();
    const name = get("name");
    const type = get("type").toUpperCase();
    const uomCode = get("base_uom").toLowerCase();
    const rowNo = r + 1;
    let ok = true;

    if (!code) { errors.push({ row: rowNo, message: "kode (code) kosong" }); ok = false; }
    if (!name) { errors.push({ row: rowNo, message: "nama (name) kosong" }); ok = false; }
    if (!ITEM_TYPES.includes(type as never)) {
      errors.push({ row: rowNo, message: `tipe "${type}" tidak valid (${ITEM_TYPES.join("/")})` }); ok = false;
    }
    const uomId = uomByCode.get(uomCode);
    if (!uomId) { errors.push({ row: rowNo, message: `satuan "${uomCode}" tidak dikenal` }); ok = false; }
    if (existingCodes.has(code)) { errors.push({ row: rowNo, message: `SKU "${code}" sudah ada di database` }); ok = false; }
    if (seenCodes.has(code)) { errors.push({ row: rowNo, message: `SKU "${code}" duplikat dalam file` }); ok = false; }
    seenCodes.add(code);

    for (const numCol of ["min_stock", "reorder_qty", "default_cost"]) {
      const v = get(numCol);
      if (v && (isNaN(Number(v)) || Number(v) < 0)) {
        errors.push({ row: rowNo, message: `${numCol} "${v}" bukan angka >= 0` });
        ok = false;
      }
    }

    if (ok) {
      const categoryName = get("category");
      valid.push({
        code, name, type, baseUomCode: uomCode, baseUomId: uomId!,
        categoryId: categoryName ? (catByName.get(categoryName.toLowerCase()) ?? undefined) : undefined,
        categoryName: categoryName || undefined,
        minStock: get("min_stock") || undefined,
        reorderQty: get("reorder_qty") || undefined,
        defaultCost: get("default_cost") || undefined,
        notes: get("notes") || undefined,
      });
    }
  }

  // Enforcemen batas paket
  if (ctx.org.maxItems !== null) {
    const current = await prisma.item.count({ where: { organizationId: ctx.org.id } });
    if (current + valid.length > ctx.org.maxItems) {
      throw badRequest(
        `Import (${valid.length} item) melampaui batas paket: saat ini ${current}, maksimum ${ctx.org.maxItems}.`,
      );
    }
  }

  return { valid, errors, totalRows: rows.length - 1 };
}

/** Commit import item yang sudah tervalidasi (dipanggil setelah preview). */
export async function commitItemsImport(
  ctx: Ctx,
  jobId: string,
) {
  const job = await prisma.importJob.findFirst({
    where: { id: jobId, organizationId: ctx.org.id, type: "ITEMS", status: "VALIDATED" },
  });
  if (!job) throw notFound("Import job tidak ditemukan atau sudah tidak valid.");
  const rows = JSON.parse(job.dataJson ?? "[]") as (ItemRowData & { categoryId?: string; baseUomId: string })[];

  const created = await prisma.$transaction(async (tx) => {
    let n = 0;
    for (const row of rows) {
      await tx.item.create({
        data: {
          organizationId: ctx.org.id,
          code: row.code,
          name: row.name,
          type: row.type,
          baseUomId: row.baseUomId,
          categoryId: row.categoryId ?? null,
          minStock: row.minStock ? storeQty(row.minStock) : null,
          reorderQty: row.reorderQty ? storeQty(row.reorderQty) : null,
          defaultCost: row.defaultCost ? storeCost(row.defaultCost) : null,
          notes: row.notes ?? null,
        },
      });
      n++;
    }
    await tx.importJob.update({
      where: { id: job.id },
      data: { status: "COMMITTED", successRows: n, committedAt: new Date() },
    });
    return n;
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "IMPORT_ITEMS", entityType: "ImportJob", entityId: job.id,
    after: { created },
  });
  return created;
}

// ---------- Validasi & commit saldo awal ----------

export interface OpeningRowData {
  itemCode: string; locationCode: string; quantity: string; unitCost?: string;
  itemId: string; locationId: string;
}

export async function validateOpeningCsv(ctx: Ctx, csvText: string) {
  const rows = parseCsv(csvText);
  if (!rows.length) throw badRequest("File CSV kosong.");
  const header = rows[0].map((h) => h.toLowerCase());
  const idx = idxMap(header);
  for (const req of ["item_code", "location_code", "quantity"]) {
    if (!idx.has(req)) throw badRequest(`Kolom wajib "${req}" tidak ditemukan pada header CSV.`);
  }

  const items = await prisma.item.findMany({ where: { organizationId: ctx.org.id } });
  const itemByCode = new Map(items.map((i) => [i.code, i]));
  const locations = await prisma.storageLocation.findMany({ where: { organizationId: ctx.org.id } });
  const locByCode = new Map(locations.map((l) => [l.code, l]));

  // Cegah import ulang yang menggandakan saldo awal (PRD §17.4):
  // item+lokasi yang sudah punya transaksi OPENING ditolak.
  const openings = await prisma.inventoryTransaction.findMany({
    where: { organizationId: ctx.org.id, type: "OPENING", status: "POSTED" },
    include: { lines: true },
  });
  const openedKeys = new Set<string>();
  for (const t of openings) {
    for (const l of t.lines) openedKeys.add(`${l.itemId}|${l.locationId}`);
  }

  const errors: { row: number; message: string }[] = [];
  const valid: OpeningRowData[] = [];
  const seen = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (col: string) => { const i = idx.get(col); return i === undefined ? "" : (row[i] ?? ""); };
    const itemCode = get("item_code").toUpperCase();
    const locationCode = get("location_code").toUpperCase();
    const qty = get("quantity");
    const rowNo = r + 1;
    let ok = true;

    const item = itemByCode.get(itemCode);
    if (!item) { errors.push({ row: rowNo, message: `item "${itemCode}" tidak ditemukan` }); ok = false; }
    const loc = locByCode.get(locationCode);
    if (!loc) { errors.push({ row: rowNo, message: `lokasi "${locationCode}" tidak ditemukan` }); ok = false; }
    const q = toDec(qty);
    if (isNaN(Number(qty)) || q.lte(0)) { errors.push({ row: rowNo, message: `kuantitas "${qty}" tidak valid (> 0)` }); ok = false; }
    const cost = get("unit_cost");
    if (cost && (isNaN(Number(cost)) || Number(cost) < 0)) {
      errors.push({ row: rowNo, message: `unit_cost "${cost}" tidak valid` }); ok = false;
    }
    const key = `${item?.id}|${loc?.id}`;
    if (seen.has(key)) { errors.push({ row: rowNo, message: "kombinasi item+lokasi duplikat dalam file" }); ok = false; }
    seen.add(key);
    if (item && loc && openedKeys.has(key)) {
      errors.push({ row: rowNo, message: `item+lokasi sudah memiliki saldo awal sebelumnya` }); ok = false;
    }

    if (ok && item && loc) {
      valid.push({
        itemCode, locationCode, quantity: q.toString(), unitCost: cost || undefined,
        itemId: item.id, locationId: loc.id,
      });
    }
  }
  return { valid, errors, totalRows: rows.length - 1 };
}

/** Commit saldo awal sebagai transaksi OPENING melalui engine (PRD §17.4). */
export async function commitOpeningImport(ctx: Ctx, jobId: string) {
  const job = await prisma.importJob.findFirst({
    where: { id: jobId, organizationId: ctx.org.id, type: "OPENING_STOCK", status: "VALIDATED" },
  });
  if (!job) throw notFound("Import job tidak ditemukan atau sudah tidak valid.");
  const rows = JSON.parse(job.dataJson ?? "[]") as OpeningRowData[];

  const posted = await createOpeningStock(ctx, {
    notes: `Saldo awal hasil import ${job.fileName}`,
    lines: rows.map((r) => ({
      itemId: r.itemId,
      locationId: r.locationId,
      quantity: r.quantity,
      unitCost: r.unitCost ?? null,
    })),
  });
  await prisma.importJob.update({
    where: { id: job.id },
    data: { status: "COMMITTED", successRows: rows.length, committedAt: new Date() },
  });
  return posted;
}

/** Simpan hasil validasi sebagai import job untuk tahap commit. */
export async function createImportJob(
  ctx: Ctx,
  type: "ITEMS" | "OPENING_STOCK",
  fileName: string,
  result: { valid: unknown[]; errors: { row: number; message: string }[]; totalRows: number },
) {
  return prisma.importJob.create({
    data: {
      organizationId: ctx.org.id,
      type,
      fileName,
      status: result.errors.length === 0 ? "VALIDATED" : "FAILED",
      totalRows: result.totalRows,
      successRows: result.valid.length,
      failedRows: result.errors.length,
      errors: JSON.stringify(result.errors.slice(0, 200)),
      dataJson: JSON.stringify(result.valid),
      createdById: ctx.user.id,
    },
  });
}

// ---------- Export CSV generik (PRD §16.6) ----------

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = c === null || c === undefined ? "" : String(c);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}
