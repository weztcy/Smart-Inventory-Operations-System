// Integration tests — inventory engine & alur inti (PRD §26.2-§26.3).
// Test DB: test.db (di-reset oleh global-setup).
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { Decimal, toDec } from "@/lib/decimal";
import { registerOrganization, inviteMember } from "@/lib/services/org";
import { createItem } from "@/lib/services/items";
import {
  createOpeningStock, createIssue, createTransfer, createReceipt,
} from "@/lib/services/transactions";
import { createAndPostTransaction } from "@/lib/inventory/engine";

let orgA: { org: { id: string; maxItems: null; maxUsers: null; maxWarehouses: null }; user: { id: string }; orgId: string };
let orgB: { org: { id: string }; user: { id: string }; orgId: string };
let itemId: string;
let itemId2: string;
let locRaw: string;
let locFin: string;
let locScrap: string;

const balance = async (orgId: string, item: string, loc: string) => {
  const b = await prisma.stockBalance.findUnique({
    where: { itemId_locationId: { itemId: item, locationId: loc } },
  });
  return b ? toDec(b.onHand) : new Decimal(0);
};

const itemAvg = async (item: string) => {
  const i = await prisma.item.findUniqueOrThrow({ where: { id: item } });
  return toDec(i.avgCost);
};

beforeAll(async () => {
  const a = await registerOrganization({
    name: "Owner A", email: "a@test.com", password: "password123", orgName: "PT Alpha",
  });
  orgA = {
    org: { id: a.orgId, maxItems: null, maxUsers: null, maxWarehouses: null },
    user: { id: a.userId },
    orgId: a.orgId,
  };
  const b = await registerOrganization({
    name: "Owner B", email: "b@test.com", password: "password123", orgName: "PT Beta",
  });
  orgB = { org: { id: b.orgId }, user: { id: b.userId }, orgId: b.orgId };

  const uomsA = await prisma.unitOfMeasure.findMany({ where: { organizationId: orgA.orgId } });
  const kg = uomsA.find((u) => u.code === "kg")!.id;
  const pcs = uomsA.find((u) => u.code === "pcs")!.id;

  const i1 = await createItem(orgA, { code: "RM-01", name: "Plat Baja", type: "RAW_MATERIAL", baseUomId: kg });
  const i2 = await createItem(orgA, { code: "FG-01", name: "Meja", type: "FINISHED_GOODS", baseUomId: pcs });
  itemId = i1.id;
  itemId2 = i2.id;

  const locsA = await prisma.storageLocation.findMany({ where: { organizationId: orgA.orgId } });
  locRaw = locsA.find((l) => l.code === "WH-01-RAW")!.id;
  locFin = locsA.find((l) => l.code === "WH-01-FIN")!.id;
  locScrap = locsA.find((l) => l.code === "WH-01-SCR")!.id;
});

describe("Engine dasar (PRD §8)", () => {
  it("saldo awal: menambah stok, ledger, dan valuasi", async () => {
    const t = await createOpeningStock(orgA, {
      lines: [{ itemId, locationId: locRaw, quantity: "100", unitCost: "10000" }],
    });
    expect(t.number).toMatch(/^OPN-\d{4}-\d{6}$/);
    expect((await balance(orgA.orgId, itemId, locRaw)).toNumber()).toBe(100);
    expect((await itemAvg(itemId)).toNumber()).toBe(10000);
    const ledger = await prisma.ledgerEntry.count({ where: { transactionId: t.id } });
    expect(ledger).toBe(1);
  });

  it("penerimaan kedua: moving weighted average", async () => {
    await createReceipt(orgA, {
      lines: [{ itemId, locationId: locRaw, quantity: "100", unitCost: "20000" }],
    }, "post");
    // (100*10000 + 100*20000) / 200 = 15000
    expect((await itemAvg(itemId)).toNumber()).toBe(15000);
    expect((await balance(orgA.orgId, itemId, locRaw)).toNumber()).toBe(200);
  });

  it("issue melebihi stok ditolak dengan pesan jelas (kasus tepi §24.1)", async () => {
    await expect(
      createIssue(orgA, {
        issueType: "INTERNAL_USE",
        lines: [{ itemId, locationId: locRaw, quantity: "250" }],
      }, "post"),
    ).rejects.toThrow(/Stok tidak cukup.*tersedia 200.*butuh 250/);
  });

  it("issue valid mengurangi stok dan valuasi pada avg", async () => {
    const t = await createIssue(orgA, {
      issueType: "INTERNAL_USE",
      lines: [{ itemId, locationId: locRaw, quantity: "50" }],
    }, "post");
    expect(t.number).toMatch(/^ISS-/);
    expect((await balance(orgA.orgId, itemId, locRaw)).toNumber()).toBe(150);
    const line = await prisma.inventoryTransactionLine.findFirstOrThrow({
      where: { transactionId: t.id },
    });
    // Nilai keluar bertanda negatif (signed), konsisten dengan kuantitas
    expect(toDec(line.value).toNumber()).toBe(-750000); // 50 * 15000
  });

  it("transfer: total kuantitas organisasi tetap, nilai netral (PRD §11.3)", async () => {
    const valueBefore = await totalValue(orgA.orgId, itemId);
    await createTransfer(orgA, {
      lines: [{ itemId, locationId: locRaw, toLocationId: locScrap, quantity: "30" }],
    }, "post");
    expect((await balance(orgA.orgId, itemId, locRaw)).toNumber()).toBe(120);
    expect((await balance(orgA.orgId, itemId, locScrap)).toNumber()).toBe(30);
    expect((await totalValue(orgA.orgId, itemId)).toNumber()).toBeCloseTo(valueBefore.toNumber(), 2);
  });

  it("idempotency key: request ulang tidak menggandakan stok (BR-04)", async () => {
    const line = { itemId, locationId: locRaw, quantity: new Decimal(5), unitCost: new Decimal(16000) };
    const t1 = await createAndPostTransaction({
      orgId: orgA.orgId, userId: orgA.user.id, type: "RECEIPT",
      idempotencyKey: "test-key-1", lines: [line],
    });
    const t2 = await createAndPostTransaction({
      orgId: orgA.orgId, userId: orgA.user.id, type: "RECEIPT",
      idempotencyKey: "test-key-1", lines: [line],
    });
    expect(t1.id).toBe(t2.id);
    expect((await balance(orgA.orgId, itemId, locRaw)).toNumber()).toBe(125);
  });

  it("issue konkuren tidak boleh menghasilkan stok negatif (PRD §8.7, skenario F)", async () => {
    // Stok tersedia 125; dua issue @ 100 secara paralel.
    const results = await Promise.allSettled([
      createIssue(orgA, { issueType: "INTERNAL_USE", lines: [{ itemId, locationId: locRaw, quantity: "100" }] }, "post"),
      createIssue(orgA, { issueType: "INTERNAL_USE", lines: [{ itemId, locationId: locRaw, quantity: "100" }] }, "post"),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    expect(ok).toBe(1);
    expect(failed).toBe(1);
    const final = await balance(orgA.orgId, itemId, locRaw);
    expect(final.toNumber()).toBe(25);
    expect(final.gte(0)).toBe(true);
  });

  it("reversal: transaksi asal jadi REVERSED dan stok kembali (BR-13)", async () => {
    const t = await createReceipt(orgA, {
      lines: [{ itemId, locationId: locRaw, quantity: "40", unitCost: "20000" }],
    }, "post");
    const before = await balance(orgA.orgId, itemId, locRaw);
    const { reverseTransaction } = await import("@/lib/inventory/engine");
    await reverseTransaction({ orgId: orgA.orgId, userId: orgA.user.id, transactionId: t.id, reason: "salah input" });
    expect((await balance(orgA.orgId, itemId, locRaw)).toNumber()).toBe(before.minus(40).toNumber());
    const orig = await prisma.inventoryTransaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(orig.status).toBe("REVERSED");
    // Reverse kedua kali ditolak
    await expect(
      reverseTransaction({ orgId: orgA.orgId, userId: orgA.user.id, transactionId: t.id }),
    ).rejects.toThrow(/sudah pernah di-reverse|Hanya transaksi POSTED/);
  });

  it("reversal ditolak bila stok sudah terpakai (kasus tepi §24.18)", async () => {
    const t = await createReceipt(orgA, {
      lines: [{ itemId, locationId: locRaw, quantity: "10", unitCost: "15000" }],
    }, "post");
    // Stok saat ini 35 (25 + 10). Keluarkan 30 sehingga sisa 5 —
    // reversal receipt (butuh 10) harus tertolak.
    await createIssue(orgA, {
      issueType: "INTERNAL_USE",
      lines: [{ itemId, locationId: locRaw, quantity: "30" }],
    }, "post");
    const { reverseTransaction } = await import("@/lib/inventory/engine");
    await expect(
      reverseTransaction({ orgId: orgA.orgId, userId: orgA.user.id, transactionId: t.id }),
    ).rejects.toThrow(/Stok tidak cukup/);
  });
});

describe("Isolasi tenant (BR-05, skenario E §26.3)", () => {
  it("organisasi lain tidak dapat memakai lokasi organisasi A", async () => {
    await expect(
      createAndPostTransaction({
        orgId: orgB.orgId, userId: orgB.user.id, type: "RECEIPT",
        lines: [{ itemId, locationId: locRaw, quantity: new Decimal(1) }],
      }),
    ).rejects.toThrow(/tidak ditemukan di organisasi ini/);
  });

  it("data organisasi B terisolasi dari A", async () => {
    const bItems = await prisma.item.count({ where: { organizationId: orgB.orgId } });
    expect(bItems).toBe(0);
    const bBalances = await prisma.stockBalance.findMany({ where: { organizationId: orgB.orgId } });
    expect(bBalances.length).toBe(0);
  });
});

async function totalValue(orgId: string, item: string): Promise<Decimal> {
  const item2 = await prisma.item.findUniqueOrThrow({ where: { id: item } });
  const rows = await prisma.stockBalance.findMany({ where: { organizationId: orgId, itemId: item } });
  const qty = rows.reduce((a, r) => a.plus(toDec(r.onHand)), new Decimal(0));
  return qty.times(toDec(item2.avgCost));
}

describe("Enforcemen batas paket (PRD §19.2)", () => {
  it("undangan melebihi seat paket ditolak", async () => {
    // Paket FREE = 3 pengguna. OrgA masih FREE? Ya (registrasi default FREE, maxUsers 3).
    // OrgA punya 1 anggota; undang 2 -> ok; undang ke-3 -> gagal.
    const ctxFree = { org: { id: orgA.orgId, maxUsers: 3 }, user: { id: orgA.user.id } };
    await inviteMember(ctxFree, { email: "u2@test.com", role: "WAREHOUSE" });
    await inviteMember(ctxFree, { email: "u3@test.com", role: "PRODUCTION" });
    await expect(
      inviteMember(ctxFree, { email: "u4@test.com", role: "VIEWER" }),
    ).rejects.toThrow(/Batas pengguna paket/);
  });
});
