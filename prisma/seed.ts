// Seed data komprehensif skala industri untuk Smart Inventory & Operations SaaS
// Mencakup puluhan item, multi-gudang, puluhan supplier/customer, BOM bertingkat,
// transaksi PO parsial & selesai, work orders, konsumsi, output, scrap, dan riwayat ledger.

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { DEFAULT_PLANS } from "../src/lib/constants";
import { registerOrganization } from "../src/lib/services/org";
import { createItem } from "../src/lib/services/items";
import {
  createCategory, createWarehouse, createLocation, createSupplier, createCustomer,
} from "../src/lib/services/master";
import {
  createOpeningStock, createReceipt, createIssue, createTransfer, createAdjustment,
} from "../src/lib/services/transactions";
import {
  createPurchaseOrder, submitPO, approvePO, receivePurchaseOrder,
} from "../src/lib/services/purchase";
import {
  createBOM, createProductionOrder, confirmProductionOrder, startProductionOrder,
  recordConsumption, recordOutput, completeProductionOrder,
} from "../src/lib/services/production";
import { createScrapRecord, classifyScrap, disposeScrap } from "../src/lib/services/scrap";
import { createStockCount, saveCounts, reconcileStockCount } from "../src/lib/services/opname";

async function wipe() {
  const tab = [
    "auditLog", "alert", "importJob", "stockCountLine", "stockCount",
    "scrapRecord", "productionOutput", "materialConsumption", "productionOrder",
    "bOMComponent", "billOfMaterials", "purchaseOrderLine", "purchaseOrder",
    "ledgerEntry", "inventoryTransactionLine", "inventoryTransaction",
    "stockReservation", "stockBalance", "item", "uomConversion", "unitOfMeasure",
    "itemCategory", "customer", "supplier", "storageLocation", "warehouse",
    "docCounter", "subscription", "invitation", "membership", "organization", "user",
  ] as const;
  for (const t of tab) {
    // @ts-expect-error dynamic model access
    await prisma[t].deleteMany();
  }
}

async function main() {
  console.log("→ Menghapus data lama…");
  await wipe();

  console.log("→ Membuat paket langganan…");
  for (const p of DEFAULT_PLANS) {
    await prisma.plan.upsert({ where: { code: p.code }, create: p, update: p });
  }

  console.log("→ Registrasi organisasi DEMO…");
  const { userId, orgId } = await registerOrganization({
    name: "Budi Demo Owner",
    email: "demo@demo.com",
    password: "demo1234",
    orgName: "[DEMO] PT Manufaktur Jaya Abadi",
    businessType: "Fabrikasi Logam & Mesin Presisi",
  });

  await prisma.organization.update({
    where: { id: orgId },
    data: { isDemo: true },
  });

  // Tingkatkan ke BUSINESS agar kuota item, user, dan gudang tanpa batas
  const bizPlan = await prisma.plan.findUniqueOrThrow({ where: { code: "BUSINESS" } });
  await prisma.subscription.update({
    where: { organizationId: orgId },
    data: { planId: bizPlan.id, status: "ACTIVE" },
  });

  const ctx = {
    org: { id: orgId, maxItems: null, maxUsers: null, maxWarehouses: null },
    user: { id: userId },
  };

  console.log("→ Membuat Kategori Item…");
  const catSteel = await createCategory(ctx, "Baja & Logam Berat", "Plat, hollow, siku, pipa, dan profil baja konstruksi");
  const catAlu = await createCategory(ctx, "Aluminium & Kuningan", "Batang extrusion, lembaran, dan profil aluminium industri");
  const catHardware = await createCategory(ctx, "Fastener & Hardware", "Baut, mur, ring, rivet, dinabolt, dan engsel");
  const catElec = await createCategory(ctx, "Komponen Elektrik", "Kabel, kontaktor, relay, inverter, panel kontrol, sensor");
  const catChemical = await createCategory(ctx, "Kimia & Pelapis", "Cat primer, thiner, degreaser, powder coating, sealant");
  const catConsumable = await createCategory(ctx, "Habis Pakai Workshop", "Batu gerinda, kawat las, gas CO2/argon, amplas, sarung tangan");
  const catWIP = await createCategory(ctx, "Barang Setengah Jadi (WIP)", "Komponen hasil cutting, bending, dan sub-assembly");
  const catFinished = await createCategory(ctx, "Produk Jadi (Finished Goods)", "Meja industri, rak heavy duty, conveyor, troli workshop");
  const catScrap = await createCategory(ctx, "Material Sisa & Scrap", "Potongan plat, gram bubut, potongan pipa, sisa kabel");

  console.log("→ Membuat Multi-Gudang & Lokasi Penyimpanan…");
  // WH-01 sudah dibuat oleh registerOrganization. Kita tambah lokasinya.
  const wh1 = await prisma.warehouse.findFirstOrThrow({ where: { organizationId: orgId, code: "WH-01" } });
  await prisma.warehouse.update({
    where: { id: wh1.id },
    data: { name: "Pabrik Utama Cikarang", address: "Kawasan Industri MM2100 Blok C-12, Cikarang", manager: "Bambang Sutrisno" },
  });
  await createLocation(ctx, wh1.id, "WH-01-CUT", "Area Cutting & Shearing", "CUTTING");
  await createLocation(ctx, wh1.id, "WH-01-WIP", "Staging Area WIP", "GENERAL");

  const wh2 = await createWarehouse(ctx, "WH-02", "Gudang Distribusi Cakung", "Jl. Raya Cakung Cilincing No. 88, Jakarta Timur", "Hendra Gunawan");
  await createLocation(ctx, wh2.id, "WH-02-RAW", "Bahan Baku Cakung", "RAW");
  await createLocation(ctx, wh2.id, "WH-02-FIN", "Barang Jadi Siap Kirim", "FINISHED");
  await createLocation(ctx, wh2.id, "WH-02-GEN", "Transit & Umum", "GENERAL");

  const wh3 = await createWarehouse(ctx, "WH-03", "Workshop Fabrikasi Karawang", "Kawasan Surya Cipta Kav. 45, Karawang", "Dimas Setiawan");
  await createLocation(ctx, wh3.id, "WH-03-RAW", "Bahan Mentah Workshop", "RAW");
  await createLocation(ctx, wh3.id, "WH-03-CUT", "Machining & Milling Area", "CUTTING");
  await createLocation(ctx, wh3.id, "WH-03-FIN", "Assembly & Finished", "FINISHED");
  await createLocation(ctx, wh3.id, "WH-03-SCR", "Gudang Scrap & Logam Sisa", "SCRAP");

  console.log("→ Membuat Supplier & Customer…");
  const suppliers = await Promise.all([
    createSupplier(ctx, { code: "SUP-001", name: "PT Baja Prima Nusantara", contactPerson: "Ir. Andi Wijaya", phone: "021-8987111", email: "sales@bajaprima.co.id", taxId: "01.234.567.8-011.000" }),
    createSupplier(ctx, { code: "SUP-002", name: "PT Alumindo Jaya Perkasa", contactPerson: "Sari Kusuma", phone: "021-8987222", email: "marketing@alumindo.co.id", taxId: "01.345.678.9-012.000" }),
    createSupplier(ctx, { code: "SUP-003", name: "CV Teknik Makmur Sejahtera", contactPerson: "Budi Santoso", phone: "021-5553331", email: "order@teknikmakmur.com" }),
    createSupplier(ctx, { code: "SUP-004", name: "PT Sarana Kimia Industri", contactPerson: "Linda Marlina", phone: "021-7788990", email: "sales@saranakimia.co.id" }),
    createSupplier(ctx, { code: "SUP-005", name: "PT Mega Fastener Indonesia", contactPerson: "Roni Gunawan", phone: "021-4455667", email: "info@megafastener.id" }),
    createSupplier(ctx, { code: "SUP-006", name: "PT Gas Alam Perkasa", contactPerson: "Iwan Fals", phone: "021-3322114", email: "gas@perkasa.co.id" }),
  ]);

  const customers = await Promise.all([
    createCustomer(ctx, { code: "CUS-001", name: "PT Astra Auto Components", contactPerson: "Drs. Hendro W.", phone: "021-6512345", email: "procurement@astra-auto.example", address: "Sunter, Jakarta Utara" }),
    createCustomer(ctx, { code: "CUS-002", name: "PT United Tractors Semesta", contactPerson: "Bambang Pamungkas", phone: "021-4600123", email: "logistics@united-tr.example", address: "Cakung, Jakarta Timur" }),
    createCustomer(ctx, { code: "CUS-003", name: "CV Konstruksi Mega Perkasa", contactPerson: "Pak Dedi Mulyadi", phone: "022-7771234", email: "dedi@konstruksimega.com", address: "Bandung Industrial Estate" }),
    createCustomer(ctx, { code: "CUS-004", name: "PT Tri Bintang Logistik", contactPerson: "Jessica Tan", phone: "021-5559876", email: "jessica@tribintang.com", address: "Tangerang" }),
  ]);

  const uoms = await prisma.unitOfMeasure.findMany({ where: { organizationId: orgId } });
  const uom = (code: string) => {
    const found = uoms.find((u) => u.code === code);
    if (!found) throw new Error(`Satuan ${code} tidak ditemukan`);
    return found.id;
  };

  console.log("→ Membuat Master Item (Katalog Komprehensif)…");
  const mkItem = (code: string, name: string, type: string, uomCode: string, extra: Partial<{
    categoryId: string; minStock: string; reorderQty: string; defaultCost: string; description: string;
  }> = {}) =>
    createItem(ctx, {
      code, name, type, baseUomId: uom(uomCode), ...extra,
    });

  // Raw Materials - Steel
  const plat2 = await mkItem("RM-PLAT-2MM", "Plat Baja Hitam SPHC 2.0mm", "RAW_MATERIAL", "kg", { categoryId: catSteel.id, minStock: "250", reorderQty: "500", defaultCost: "42000" });
  const plat3 = await mkItem("RM-PLAT-3MM", "Plat Baja SS400 3.0mm", "RAW_MATERIAL", "kg", { categoryId: catSteel.id, minStock: "300", reorderQty: "600", defaultCost: "52000" });
  const plat5 = await mkItem("RM-PLAT-5MM", "Plat Baja SS400 5.0mm", "RAW_MATERIAL", "kg", { categoryId: catSteel.id, minStock: "200", reorderQty: "400", defaultCost: "78000" });
  const plat10 = await mkItem("RM-PLAT-10MM", "Plat Kapal A36 10.0mm", "RAW_MATERIAL", "kg", { categoryId: catSteel.id, minStock: "150", reorderQty: "300", defaultCost: "98000" });
  const hollow40 = await mkItem("RM-HOLLOW-40", "Besi Hollow Hitam 40x40x2.0mm", "RAW_MATERIAL", "m", { categoryId: catSteel.id, minStock: "100", reorderQty: "200", defaultCost: "45000" });
  const hollow50 = await mkItem("RM-HOLLOW-50", "Besi Hollow Hitam 50x50x2.3mm", "RAW_MATERIAL", "m", { categoryId: catSteel.id, minStock: "80", reorderQty: "150", defaultCost: "62000" });
  const pipa2in = await mkItem("RM-PIPA-2IN", "Pipa Seamless Sch40 2 inch", "RAW_MATERIAL", "m", { categoryId: catSteel.id, minStock: "60", reorderQty: "120", defaultCost: "85000" });
  const siku50 = await mkItem("RM-SIKU-50", "Besi Siku 50x50x5mm", "RAW_MATERIAL", "m", { categoryId: catSteel.id, minStock: "120", reorderQty: "250", defaultCost: "54000" });

  // Raw Materials - Aluminium & Kuningan
  const aluPlat = await mkItem("RM-ALU-PL-2", "Plat Aluminium 5052 2.0mm", "RAW_MATERIAL", "kg", { categoryId: catAlu.id, minStock: "100", reorderQty: "200", defaultCost: "92000" });
  const aluProfile = await mkItem("RM-ALU-PROF", "Profil Aluminium T-Slot 4040", "RAW_MATERIAL", "m", { categoryId: catAlu.id, minStock: "75", reorderQty: "150", defaultCost: "75000" });
  const kuninganBar = await mkItem("RM-BRASS-HEX", "Batang Kuningan Hexagonal 19mm", "RAW_MATERIAL", "kg", { categoryId: catAlu.id, minStock: "50", reorderQty: "100", defaultCost: "145000" });

  // Fasteners & Hardware
  const baut10 = await mkItem("HD-BAUT-M10", "Baut Hexagon HTB M10x30 + Mur", "RAW_MATERIAL", "pcs", { categoryId: catHardware.id, minStock: "1000", reorderQty: "2500", defaultCost: "1600" });
  const baut12 = await mkItem("HD-BAUT-M12", "Baut Hexagon HTB M12x45 + Mur", "RAW_MATERIAL", "pcs", { categoryId: catHardware.id, minStock: "800", reorderQty: "2000", defaultCost: "2400" });
  const dinabolt = await mkItem("HD-DINA-M12", "Dynabolt Heavy Duty M12x100", "RAW_MATERIAL", "pcs", { categoryId: catHardware.id, minStock: "300", reorderQty: "600", defaultCost: "6500" });
  const rodaCaster = await mkItem("HD-RODA-PU4", "Roda Caster PU 4 inch Swivel Lock", "RAW_MATERIAL", "pcs", { categoryId: catHardware.id, minStock: "40", reorderQty: "100", defaultCost: "68000" });

  // Kimia & Finishing
  const catPrimer = await mkItem("CH-EPOXY-PRI", "Epoxy Primer Grey Zinc Phosphate", "RAW_MATERIAL", "l", { categoryId: catChemical.id, minStock: "30", reorderQty: "60", defaultCost: "115000" });
  const catTopcoat = await mkItem("CH-PU-TOPCOAT", "Polyurethane Topcoat Safety Blue", "RAW_MATERIAL", "l", { categoryId: catChemical.id, minStock: "25", reorderQty: "50", defaultCost: "135000" });
  const thiner = await mkItem("CH-THINNER-PU", "Thinner Polyurethane Special Grade", "RAW_MATERIAL", "l", { categoryId: catChemical.id, minStock: "50", reorderQty: "100", defaultCost: "38000" });

  // Consumables Workshop
  const kawatLas = await mkItem("CO-WELD-MIG", "Kawat Las MIG ER70S-6 1.2mm (15kg)", "CONSUMABLE", "roll", { categoryId: catConsumable.id, minStock: "10", reorderQty: "25", defaultCost: "380000" });
  const batuGerinda = await mkItem("CO-GRIND-4IN", "Batu Gerinda Potong 4 inch x 1mm", "CONSUMABLE", "box", { categoryId: catConsumable.id, minStock: "15", reorderQty: "40", defaultCost: "125000" });
  const sarungTangan = await mkItem("CO-GLOVE-LEATH", "Sarung Tangan Las Kulit Sapi 16 inch", "CONSUMABLE", "pcs", { categoryId: catConsumable.id, minStock: "30", reorderQty: "60", defaultCost: "28000" });

  // Work In Progress (WIP)
  const wipKakiMeja = await mkItem("WIP-LEG-FRAME", "Sub-Assembly Kaki Meja Heavy Duty", "WIP", "pcs", { categoryId: catWIP.id, defaultCost: "320000" });
  const wipTopPlate = await mkItem("WIP-TOP-PLATE", "Top Plate Selesai Cutting & Chamfer", "WIP", "pcs", { categoryId: catWIP.id, defaultCost: "480000" });
  const wipRakTiang = await mkItem("WIP-TIANG-RAK", "Tiang Rak Berlubang Punching 2m", "WIP", "pcs", { categoryId: catWIP.id, defaultCost: "185000" });

  // Finished Goods (Produk Jadi)
  const fgMejaWS = await mkItem("FG-MEJA-WS", "Meja Kerja Workshop Heavy Duty 200x100cm", "FINISHED_GOODS", "pcs", { categoryId: catFinished.id, defaultCost: "1850000" });
  const fgRakBaja = await mkItem("FG-RAK-BAJA", "Rak Gudang Pallet 4 Tingkat Kapasitas 2 Ton", "FINISHED_GOODS", "pcs", { categoryId: catFinished.id, defaultCost: "3200000" });
  const fgTroli = await mkItem("FG-TROLI-MAT", "Troli Material Dorong Kapasitas 500kg", "FINISHED_GOODS", "pcs", { categoryId: catFinished.id, defaultCost: "1250000" });
  const fgConveyor = await mkItem("FG-CONV-ROLY", "Gravity Roller Conveyor 3 Meter", "FINISHED_GOODS", "pcs", { categoryId: catFinished.id, defaultCost: "4500000" });

  // Scrap Items
  const scPlat = await mkItem("SC-PLAT-BESI", "Scrap Potongan Plat & Offcuts", "SCRAP", "kg", { categoryId: catScrap.id, description: "Potongan plat sisa shearing & CNC plasma", defaultCost: "7500" });
  const scHollow = await mkItem("SC-BESI-HOLLOW", "Scrap Potongan Pipa & Hollow", "SCRAP", "kg", { categoryId: catScrap.id, defaultCost: "7000" });
  const scGram = await mkItem("SC-GRAM-BUBUT", "Gram Serbuk Besi Hasil Bubut / Milling", "SCRAP", "kg", { categoryId: catScrap.id, defaultCost: "5500" });
  const scAlu = await mkItem("SC-ALU-OFFCUT", "Scrap Aluminium Offcut Campur", "SCRAP", "kg", { categoryId: catScrap.id, defaultCost: "24000" });

  const locs = await prisma.storageLocation.findMany({ where: { organizationId: orgId } });
  const loc = (code: string) => {
    const found = locs.find((l) => l.code === code);
    if (!found) throw new Error(`Lokasi ${code} tidak ditemukan`);
    return found.id;
  };

  console.log("→ Memasukkan Saldo Awal (Transaksional OPENING)…");
  await createOpeningStock(ctx, {
    notes: "Saldo awal inventaris pabrik & gudang cabang",
    lines: [
      { itemId: plat2.id, locationId: loc("WH-01-RAW"), quantity: "1800", unitCost: "41500" },
      { itemId: plat3.id, locationId: loc("WH-01-RAW"), quantity: "2400", unitCost: "51500" },
      { itemId: plat5.id, locationId: loc("WH-01-RAW"), quantity: "1500", unitCost: "77000" },
      { itemId: plat10.id, locationId: loc("WH-01-RAW"), quantity: "950", unitCost: "96500" },
      { itemId: hollow40.id, locationId: loc("WH-01-RAW"), quantity: "450", unitCost: "44000" },
      { itemId: hollow50.id, locationId: loc("WH-01-RAW"), quantity: "320", unitCost: "61000" },
      { itemId: pipa2in.id, locationId: loc("WH-01-RAW"), quantity: "280", unitCost: "84000" },
      { itemId: siku50.id, locationId: loc("WH-01-RAW"), quantity: "380", unitCost: "53000" },
      { itemId: aluPlat.id, locationId: loc("WH-01-RAW"), quantity: "400", unitCost: "91000" },
      { itemId: aluProfile.id, locationId: loc("WH-01-RAW"), quantity: "300", unitCost: "74000" },
      { itemId: kuninganBar.id, locationId: loc("WH-01-RAW"), quantity: "180", unitCost: "142000" },
      { itemId: baut10.id, locationId: loc("WH-01-RAW"), quantity: "5000", unitCost: "1500" },
      { itemId: baut12.id, locationId: loc("WH-01-RAW"), quantity: "3500", unitCost: "2300" },
      { itemId: dinabolt.id, locationId: loc("WH-01-RAW"), quantity: "800", unitCost: "6300" },
      { itemId: rodaCaster.id, locationId: loc("WH-01-RAW"), quantity: "120", unitCost: "66000" },
      { itemId: catPrimer.id, locationId: loc("WH-01-RAW"), quantity: "100", unitCost: "112000" },
      { itemId: catTopcoat.id, locationId: loc("WH-01-RAW"), quantity: "80", unitCost: "132000" },
      { itemId: thiner.id, locationId: loc("WH-01-RAW"), quantity: "150", unitCost: "37000" },
      { itemId: kawatLas.id, locationId: loc("WH-01-RAW"), quantity: "35", unitCost: "375000" },
      { itemId: batuGerinda.id, locationId: loc("WH-01-RAW"), quantity: "50", unitCost: "120000" },
      { itemId: sarungTangan.id, locationId: loc("WH-01-RAW"), quantity: "80", unitCost: "27000" },
      // Stok di Gudang Karawang (WH-03)
      { itemId: plat3.id, locationId: loc("WH-03-RAW"), quantity: "800", unitCost: "52000" },
      { itemId: hollow40.id, locationId: loc("WH-03-RAW"), quantity: "200", unitCost: "45000" },
      { itemId: siku50.id, locationId: loc("WH-03-RAW"), quantity: "150", unitCost: "54000" },
      { itemId: baut10.id, locationId: loc("WH-03-RAW"), quantity: "1500", unitCost: "1550" },
      // Stok awal Produk Jadi siap kirim di Cakung (WH-02)
      { itemId: fgMejaWS.id, locationId: loc("WH-02-FIN"), quantity: "15", unitCost: "1800000" },
      { itemId: fgRakBaja.id, locationId: loc("WH-02-FIN"), quantity: "8", unitCost: "3100000" },
    ],
  });

  console.log("→ Membuat & Menerima Purchase Orders (PO-001 s.d PO-005)…");
  // PO-1: Restock baja berat - Fully Received
  const po1 = await createPurchaseOrder(ctx, {
    supplierId: suppliers[0].id,
    expectedDate: new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10),
    notes: "Pengadaan plat dan profil SS400 untuk proyek Q1",
    submit: true,
    lines: [
      { itemId: plat3.id, orderedQty: "1000", unitPrice: "52000" },
      { itemId: plat5.id, orderedQty: "800", unitPrice: "78500" },
      { itemId: hollow50.id, orderedQty: "150", unitPrice: "62500" },
    ],
  });
  await approvePO(ctx, po1.id);
  const po1Lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po1.id } });
  await receivePurchaseOrder(ctx, po1.id, {
    locationId: loc("WH-01-RAW"),
    reference: "SJ-BP-99821",
    lines: [
      { poLineId: po1Lines[0].id, receivedQty: "1000" },
      { poLineId: po1Lines[1].id, receivedQty: "800" },
      { poLineId: po1Lines[2].id, receivedQty: "150" },
    ],
  });

  // PO-2: Fasteners & Roda - Partially Received
  const po2 = await createPurchaseOrder(ctx, {
    supplierId: suppliers[4].id,
    expectedDate: new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10),
    notes: "Baut M10 M12 dan roda caster untuk lini perakitan",
    submit: true,
    lines: [
      { itemId: baut10.id, orderedQty: "3000", unitPrice: "1550" },
      { itemId: baut12.id, orderedQty: "2000", unitPrice: "2350" },
      { itemId: rodaCaster.id, orderedQty: "80", unitPrice: "67000" },
    ],
  });
  await approvePO(ctx, po2.id);
  const po2Lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po2.id } });
  await receivePurchaseOrder(ctx, po2.id, {
    locationId: loc("WH-01-RAW"),
    reference: "SJ-MF-4410",
    lines: [
      { poLineId: po2Lines[0].id, receivedQty: "3000" },
      { poLineId: po2Lines[1].id, receivedQty: "1200" }, // parsial
      { poLineId: po2Lines[2].id, receivedQty: "40" },   // parsial
    ],
  });

  // PO-3: Kimia & Cat - Approved (Menunggu datang / Outstanding)
  const po3 = await createPurchaseOrder(ctx, {
    supplierId: suppliers[3].id,
    expectedDate: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    notes: "Restock epoxy primer & topcoat safety blue",
    submit: true,
    lines: [
      { itemId: catPrimer.id, orderedQty: "80", unitPrice: "114000" },
      { itemId: catTopcoat.id, orderedQty: "60", unitPrice: "134000" },
      { itemId: thiner.id, orderedQty: "100", unitPrice: "37500" },
    ],
  });
  await approvePO(ctx, po3.id);

  // PO-4: Aluminium Profile - Submitted (Menunggu approval)
  await createPurchaseOrder(ctx, {
    supplierId: suppliers[1].id,
    expectedDate: new Date(Date.now() + 12 * 864e5).toISOString().slice(0, 10),
    notes: "Profil T-Slot 4040 untuk rangka konveyor",
    submit: true,
    lines: [
      { itemId: aluProfile.id, orderedQty: "200", unitPrice: "74500" },
      { itemId: aluPlat.id, orderedQty: "250", unitPrice: "91500" },
    ],
  });

  // PO-5: Gas & Kawat Las - Draft
  await createPurchaseOrder(ctx, {
    supplierId: suppliers[2].id,
    expectedDate: new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10),
    notes: "Draft pengadaan kawat las dan perlengkapan workshop",
    submit: false,
    lines: [
      { itemId: kawatLas.id, orderedQty: "40", unitPrice: "372000" },
      { itemId: batuGerinda.id, orderedQty: "60", unitPrice: "122000" },
    ],
  });

  console.log("→ Menjalankan Transaksi Operasional (Receipt, Issue, Transfer, Adj)…");
  // Penerimaan langsung non-PO (Direct Receipt)
  await createReceipt(ctx, {
    supplierId: suppliers[2].id,
    reference: "DIR-REC-2026-01",
    notes: "Pembelian mendesak batu gerinda & sarung tangan tambahan",
    lines: [
      { itemId: batuGerinda.id, locationId: loc("WH-01-RAW"), quantity: "20", unitCost: "124000" },
      { itemId: sarungTangan.id, locationId: loc("WH-01-RAW"), quantity: "30", unitCost: "27500" },
    ],
  }, "post");

  // Pengeluaran Internal (Pemeliharaan pabrik)
  await createIssue(ctx, {
    issueType: "INTERNAL_USE",
    destination: "Divisi Maintenance & Utilitas Gedung",
    notes: "Perbaikan atap dan rangka workshop Cikarang",
    lines: [
      { itemId: siku50.id, locationId: loc("WH-01-RAW"), quantity: "35" },
      { itemId: baut10.id, locationId: loc("WH-01-RAW"), quantity: "150" },
      { itemId: catPrimer.id, locationId: loc("WH-01-RAW"), quantity: "12" },
      { itemId: sarungTangan.id, locationId: loc("WH-01-RAW"), quantity: "10" },
    ],
  }, "post");

  // Pengeluaran untuk Project Penjualan Langsung
  await createIssue(ctx, {
    issueType: "SALE",
    destination: "Pengiriman ke PT Astra Auto Components",
    reference: "DO-AAC-00129",
    notes: "Penjualan material plat & pipa potong",
    lines: [
      { itemId: plat10.id, locationId: loc("WH-01-RAW"), quantity: "120" },
      { itemId: pipa2in.id, locationId: loc("WH-01-RAW"), quantity: "45" },
    ],
  }, "post");

  // Transfer Antar Gudang: Cikarang (WH-01) -> Cakung (WH-02)
  await createTransfer(ctx, {
    notes: "Relokasi stok pengaman bahan baku ke Cakung",
    lines: [
      { itemId: plat3.id, locationId: loc("WH-01-RAW"), toLocationId: loc("WH-02-RAW"), quantity: "350" },
      { itemId: hollow40.id, locationId: loc("WH-01-RAW"), toLocationId: loc("WH-02-RAW"), quantity: "80" },
      { itemId: baut10.id, locationId: loc("WH-01-RAW"), toLocationId: loc("WH-02-RAW"), quantity: "800" },
    ],
  }, "post");

  // Transfer Antar Gudang: Cikarang (WH-01) -> Karawang Workshop (WH-03)
  await createTransfer(ctx, {
    notes: "Suplai material untuk workshop Karawang",
    lines: [
      { itemId: plat5.id, locationId: loc("WH-01-RAW"), toLocationId: loc("WH-03-RAW"), quantity: "250" },
      { itemId: kawatLas.id, locationId: loc("WH-01-RAW"), toLocationId: loc("WH-03-RAW"), quantity: "10" },
    ],
  }, "post");

  // Adjustment Koreksi Stok (newQty = saldo fisik baru yang dihitung)
  await createAdjustment(ctx, {
    reason: "Hasil temuan verifikasi tim audit internal",
    notes: "Penyesuaian selisih fisik plat 2mm di rak 4 (1800 -> 1785)",
    lines: [
      { itemId: plat2.id, locationId: loc("WH-01-RAW"), newQty: "1785" },
    ],
  }, "post");

  console.log("→ Membuat Bill of Materials (BOM) Lengkap…");
  // BOM 1: Meja Workshop Heavy Duty
  const bomMeja = await createBOM(ctx, {
    itemId: fgMejaWS.id,
    outputQty: "1",
    notes: "Standar fabrikasi meja workshop 200x100cm",
    components: [
      { componentItemId: plat5.id, quantity: "35", scrapPercent: "4" },   // top plate 5mm
      { componentItemId: hollow50.id, quantity: "12", scrapPercent: "2" }, // rangka kaki 50x50
      { componentItemId: siku50.id, quantity: "6", scrapPercent: "1" },    // bracing siku
      { componentItemId: baut12.id, quantity: "24" },
      { componentItemId: catPrimer.id, quantity: "1.2" },
      { componentItemId: catTopcoat.id, quantity: "1.5" },
      { componentItemId: thiner.id, quantity: "0.8" },
    ],
  });

  // BOM 2: Rak Baja Pallet 4 Tingkat
  const bomRak = await createBOM(ctx, {
    itemId: fgRakBaja.id,
    outputQty: "1",
    notes: "Rak pallet industri kapasitas 2000kg",
    components: [
      { componentItemId: hollow50.id, quantity: "28", scrapPercent: "3" }, // tiang utama
      { componentItemId: plat3.id, quantity: "45", scrapPercent: "5" },    // ambalan plat
      { componentItemId: siku50.id, quantity: "16", scrapPercent: "2" },   // cross beam
      { componentItemId: baut12.id, quantity: "48" },
      { componentItemId: dinabolt.id, quantity: "8" },
      { componentItemId: catPrimer.id, quantity: "2.5" },
      { componentItemId: catTopcoat.id, quantity: "3.0" },
    ],
  });

  // BOM 3: Troli Material 500kg
  const bomTroli = await createBOM(ctx, {
    itemId: fgTroli.id,
    outputQty: "1",
    notes: "Troli workshop beroda PU heavy duty",
    components: [
      { componentItemId: plat2.id, quantity: "18", scrapPercent: "3" },
      { componentItemId: pipa2in.id, quantity: "4.5" },
      { componentItemId: siku50.id, quantity: "5.0" },
      { componentItemId: rodaCaster.id, quantity: "4" },
      { componentItemId: baut10.id, quantity: "16" },
      { componentItemId: catTopcoat.id, quantity: "0.9" },
    ],
  });

  console.log("→ Menjalankan Siklus Work Orders / Produksi…");
  // MO-1: Meja Workshop - SELESAI (COMPLETED) + Konsumsi + Output + Scrap
  const mo1 = await createProductionOrder(ctx, {
    itemId: fgMejaWS.id, bomId: bomMeja.id, plannedQty: "8",
    sourceWarehouseId: wh1.id, destinationWarehouseId: wh1.id, assignedTo: "Suryanto", notes: "Pesanan batch meja untuk warehouse Cakung",
  });
  await confirmProductionOrder(ctx, mo1.id);
  await startProductionOrder(ctx, mo1.id);
  await recordConsumption(ctx, {
    moId: mo1.id,
    lines: [
      { itemId: plat5.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "288" },
      { itemId: hollow50.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "98" },
      { itemId: siku50.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "49" },
      { itemId: baut12.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "192" },
      { itemId: catPrimer.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "10" },
      { itemId: catTopcoat.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "12.5" },
      { itemId: thiner.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "6.5" },
    ],
  });
  await recordOutput(ctx, {
    moId: mo1.id, destinationLocationId: loc("WH-01-FIN"), actualQty: "8",
    notes: "8 unit meja lolos QC 100%",
  });
  // Catat scrap potongan plat dari MO-1
  const scRec1 = await createScrapRecord(ctx, {
    productionOrderId: mo1.id,
    sourceItemId: plat5.id,
    sourceLocationId: loc("WH-01-RAW"),
    scrapItemId: scPlat.id,
    scrapQty: "18.5",
    category: "REUSABLE",
    destinationLocationId: loc("WH-01-SCR"),
    cause: "Sisa pemotongan plat dimensi panjang",
    estimatedValue: "138750",
  });
  await completeProductionOrder(ctx, mo1.id, true);

  // MO-2: Rak Baja Pallet - COMPLETED
  const mo2 = await createProductionOrder(ctx, {
    itemId: fgRakBaja.id, bomId: bomRak.id, plannedQty: "6",
    sourceWarehouseId: wh1.id, destinationWarehouseId: wh1.id, assignedTo: "Agus Waluyo", notes: "Fabrikasi rak pallet heavy duty",
  });
  await confirmProductionOrder(ctx, mo2.id);
  await startProductionOrder(ctx, mo2.id);
  await recordConsumption(ctx, {
    moId: mo2.id,
    lines: [
      { itemId: hollow50.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "172" },
      { itemId: plat3.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "280" },
      { itemId: siku50.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "98" },
      { itemId: baut12.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "288" },
      { itemId: dinabolt.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "48" },
      { itemId: catPrimer.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "15.5" },
      { itemId: catTopcoat.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "18.5" },
    ],
  });
  await recordOutput(ctx, {
    moId: mo2.id, destinationLocationId: loc("WH-01-FIN"), actualQty: "6",
    notes: "Selesai tepat waktu",
  });
  await completeProductionOrder(ctx, mo2.id, true);

  // MO-3: Troli Material - IN_PROGRESS (Dengan reservasi aktif & konsumsi parsial)
  const mo3 = await createProductionOrder(ctx, {
    itemId: fgTroli.id, bomId: bomTroli.id, plannedQty: "10",
    sourceWarehouseId: wh1.id, destinationWarehouseId: wh1.id, assignedTo: "Budi Santoso", notes: "Produksi 10 troli material pabrik",
  });
  await confirmProductionOrder(ctx, mo3.id);
  await startProductionOrder(ctx, mo3.id);
  await recordConsumption(ctx, {
    moId: mo3.id,
    lines: [
      { itemId: plat2.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "120" }, // konsumsi tahap 1
      { itemId: pipa2in.id, sourceLocationId: loc("WH-01-RAW"), actualQty: "30" },
    ],
  });
  // Sebagian output selesai lebih awal
  await recordOutput(ctx, {
    moId: mo3.id, destinationLocationId: loc("WH-01-FIN"), actualQty: "4",
    notes: "Batch pertama 4 unit selesai dirakit",
  });

  // MO-4: Meja Workshop di Karawang - CONFIRMED (Reservasi aktif untuk demo dashboard)
  const mo4 = await createProductionOrder(ctx, {
    itemId: fgMejaWS.id, bomId: bomMeja.id, plannedQty: "4",
    sourceWarehouseId: wh3.id, destinationWarehouseId: wh3.id, assignedTo: "Dimas Setiawan", notes: "Proyek workshop Karawang",
  });
  await confirmProductionOrder(ctx, mo4.id);

  console.log("→ Pencatatan & Pengelolaan Scrap…");
  // Scrap potongan plat dari MO-1 diklasifikasikan REUSABLE
  await classifyScrap(ctx, scRec1.recordId, "REUSABLE");

  // Scrap potongan pipa & hollow PENDING tanpa MO
  const scRec2 = await createScrapRecord(ctx, {
    sourceItemId: hollow40.id,
    sourceLocationId: loc("WH-01-RAW"),
    scrapItemId: scHollow.id,
    scrapQty: "32.0",
    category: "PENDING",
    destinationLocationId: loc("WH-01-SCR"),
    cause: "Sisa pemotongan uji coba beveling mesin",
  });

  // Scrap gram bubut SALEABLE
  const scRec3 = await createScrapRecord(ctx, {
    sourceItemId: kuninganBar.id,
    sourceLocationId: loc("WH-01-RAW"),
    scrapItemId: scGram.id,
    scrapQty: "45.0",
    category: "SALEABLE",
    destinationLocationId: loc("WH-01-SCR"),
    cause: "Serpihan bubut kuningan presisi",
    estimatedValue: "247500",
  });

  // Scrap plat di Karawang
  await createScrapRecord(ctx, {
    sourceItemId: plat3.id,
    sourceLocationId: loc("WH-03-RAW"),
    scrapItemId: scPlat.id,
    scrapQty: "24.0",
    category: "PENDING",
    destinationLocationId: loc("WH-03-SCR"),
    cause: "Offcut fabrikasi tiang",
  });

  // Pembuangan / Penjualan Scrap (Disposal)
  await disposeScrap(ctx, {
    scrapRecordId: scRec3.recordId,
    itemId: scGram.id,
    locationId: loc("WH-01-SCR"),
    quantity: "35.0",
    method: "Penjualan ke Pengepul Logam CV Berkah Logam",
    reason: "Penjualan rutin gram bubut tembaga/kuningan bulanan",
  });

  console.log("→ Menjalankan Stock Opname Terjadwal…");
  const count1 = await createStockCount(ctx, {
    warehouseId: wh1.id,
    locationId: loc("WH-01-RAW"),
    notes: "Opname triwulan gudang bahan baku Cikarang",
  });
  const countLines = await prisma.stockCountLine.findMany({
    where: { stockCountId: count1.id },
  });
  await saveCounts(ctx, count1.id, countLines.map((l, idx) => {
    const baseline = Number(l.baselineQty);
    // Beri selisih wajar di beberapa item
    let counted = baseline;
    if (idx === 0) counted = Math.max(0, baseline - 5);
    else if (idx === 2) counted = baseline + 2;
    else if (idx === 4) counted = Math.max(0, baseline - 1);
    return { lineId: l.id, countedQty: String(counted) };
  }));
  await reconcileStockCount(ctx, count1.id);

  console.log("→ Menambahkan Pengguna Tim Multi-Role…");
  const usersToCreate = [
    { email: "gudang@demo.com", name: "Raka Pratama (Kepala Gudang)", role: "WAREHOUSE" },
    { email: "produksi@demo.com", name: "Agus Hermawan (Supervisor Produksi)", role: "PRODUCTION" },
    { email: "manager@demo.com", name: "Maya Indriani (Operations Manager)", role: "MANAGER" },
    { email: "auditor@demo.com", name: "Satrio Utomo (Internal Auditor)", role: "VIEWER" },
  ];

  for (const u of usersToCreate) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    let createdUser = existing;
    if (!createdUser) {
      createdUser = await prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          passwordHash: await bcrypt.hash("demo1234", 10),
        },
      });
    }
    const mem = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: createdUser.id, organizationId: orgId } },
    });
    if (!mem) {
      await prisma.membership.create({
        data: { userId: createdUser.id, organizationId: orgId, role: u.role },
      });
    }
  }

  // Kirim contoh undangan aktif (Invitations)
  await prisma.invitation.create({
    data: {
      organizationId: orgId,
      email: "engineer.baru@perusahaan.example",
      role: "PRODUCTION",
      token: "inv-demo-engineer-2026",
      status: "PENDING",
      invitedById: userId,
      expiresAt: new Date(Date.now() + 7 * 864e5),
    },
  });

  const [itemCount, whCount, locCount, poCount, moCount, txCount, ledgerCount] = await Promise.all([
    prisma.item.count({ where: { organizationId: orgId } }),
    prisma.warehouse.count({ where: { organizationId: orgId } }),
    prisma.storageLocation.count({ where: { organizationId: orgId } }),
    prisma.purchaseOrder.count({ where: { organizationId: orgId } }),
    prisma.productionOrder.count({ where: { organizationId: orgId } }),
    prisma.inventoryTransaction.count({ where: { organizationId: orgId } }),
    prisma.ledgerEntry.count({ where: { organizationId: orgId } }),
  ]);

  console.log("============================================================");
  console.log(`✓ SEEDING SELESAI DENGAN DATA BESAR & LENGKAP:`);
  console.log(`  - ${itemCount} Master Item (Baja, Alu, Hardware, Kimia, WIP, FG, Scrap)`);
  console.log(`  - ${whCount} Gudang & ${locCount} Lokasi Penyimpanan Terklasifikasi`);
  console.log(`  - ${poCount} Purchase Orders (Draft, Submitted, Approved, Partially/Fully Received)`);
  console.log(`  - ${moCount} Work Orders & BOM (Completed, In Progress, Confirmed)`);
  console.log(`  - ${txCount} Dokumen Transaksi Inventori`);
  console.log(`  - ${ledgerCount} Jurnal Baris Ledger Pergerakan Stok`);
  console.log("------------------------------------------------------------");
  console.log("Kredensial Login Demo (Password semua: demo1234):");
  console.log("  • Owner      : demo@demo.com");
  console.log("  • Manager    : manager@demo.com");
  console.log("  • Gudang     : gudang@demo.com");
  console.log("  • Produksi   : produksi@demo.com");
  console.log("  • Auditor    : auditor@demo.com");
  console.log("============================================================");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
