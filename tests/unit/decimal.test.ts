// Unit tests — perhitungan inti (PRD §26.1).
import { describe, it, expect } from "vitest";
import {
  Decimal, computeMovingAverage, computeReorderSuggestion, formatQty, toDec, storeQty,
} from "@/lib/decimal";
import { roleHas } from "@/lib/constants";
import { parseCsv } from "@/lib/services/importCsv";

describe("computeMovingAverage (PRD §8.5)", () => {
  it("stok awal nol: avg = biaya masuk", () => {
    const r = computeMovingAverage(0, 0, 100, 10);
    expect(r.newAvg.toNumber()).toBe(10);
    expect(r.newQty.toNumber()).toBe(100);
  });

  it("rata-rata tertimbang klasik", () => {
    // 100 @ 10 lalu +100 @ 20 => avg 15
    const r = computeMovingAverage(100, 10, 100, 20);
    expect(r.newAvg.toNumber()).toBe(15);
  });

  it("biaya nol yang sah tidak menghasilkan NaN", () => {
    const r = computeMovingAverage(50, 8, 50, 0);
    expect(r.newAvg.toNumber()).toBe(4); // (400 + 0) / 100
    expect(r.newQty.toNumber()).toBe(100);
  });

  it("koreksi negatif: denominator berkurang, avg dihitung ulang", () => {
    // 100 @ 10, koreksi -50 @ 10 => (1000-500)/50 = 10
    const r = computeMovingAverage(100, 10, -50, 10);
    expect(r.newAvg.toNumber()).toBe(10);
    expect(r.newQty.toNumber()).toBe(50);
  });

  it("stok menjadi nol: avg direset (hindari nilai membekal)", () => {
    const r = computeMovingAverage(100, 10, -100, 10);
    expect(r.newQty.toNumber()).toBe(0);
    expect(r.newAvg.toNumber()).toBe(0);
  });

  it("presisi desimal tanpa float error", () => {
    const r = computeMovingAverage("0.1", "0.1", "0.2", "0.1");
    expect(r.newAvg.toNumber()).toBeCloseTo(0.1, 10);
    expect(r.newQty.toString()).toBe("0.3");
  });
});

describe("computeReorderSuggestion (PRD §15.2)", () => {
  it("menyarankan kekurangan terhadap minimum", () => {
    const r = computeReorderSuggestion(30, 100, null);
    expect(r?.toNumber()).toBe(70);
  });
  it("memakai reorder qty bila lebih besar dari kekurangan", () => {
    const r = computeReorderSuggestion(30, 100, 150);
    expect(r?.toNumber()).toBe(150);
  });
  it("mengurangi penerimaan yang sudah dipesan", () => {
    const r = computeReorderSuggestion(30, 100, null, 40);
    expect(r?.toNumber()).toBe(30);
  });
  it("tidak menyarankan bila stok cukup", () => {
    expect(computeReorderSuggestion(120, 100, null)).toBeNull();
  });
  it("tanpa ambang minimum tidak menyarankan", () => {
    expect(computeReorderSuggestion(0, null, null)).toBeNull();
  });
});

describe("format & normalisasi", () => {
  it("formatQty membuang nola berlebih", () => {
    expect(formatQty("12.5000")).toBe("12,5");
    expect(formatQty("0.0000")).toBe("0");
    expect(formatQty("-3.2500")).toBe("-3,25");
  });
  it("storeQty menormalkan ke 4 desimal", () => {
    expect(storeQty(1.5)).toBe("1.5000");
  });
  it("toDec menangani null/undefined sebagai 0", () => {
    expect(toDec(null).toNumber()).toBe(0);
    expect(toDec(undefined).eq(new Decimal(0))).toBe(true);
  });
});

describe("permission matrix (PRD §4.7, §26.1)", () => {
  it("viewer tidak bisa membuat transaksi", () => {
    expect(roleHas("VIEWER", "tx.create")).toBe(false);
    expect(roleHas("VIEWER", "report.export")).toBe(true);
  });
  it("owner punya semua izin", () => {
    expect(roleHas("OWNER", "settings.manage")).toBe(true);
    expect(roleHas("OWNER", "billing.manage")).toBe(true);
  });
  it("manager bisa posting & reverse tapi bukan billing", () => {
    expect(roleHas("MANAGER", "tx.post")).toBe(true);
    expect(roleHas("MANAGER", "tx.reverse")).toBe(true);
    expect(roleHas("MANAGER", "billing.manage")).toBe(false);
  });
  it("produksi bisa mencatat konsumsi & scrap", () => {
    expect(roleHas("PRODUCTION", "production.manage")).toBe(true);
    expect(roleHas("PRODUCTION", "scrap.manage")).toBe(true);
    expect(roleHas("PRODUCTION", "tx.post")).toBe(false);
  });
});

describe("parseCsv (PRD §17)", () => {
  it("menangani koma dalam kutip dan CRLF", () => {
    const rows = parseCsv('code,name\r\nA1,"Baja, 3mm"\r\nA2,"Kata ""quote"""\n');
    expect(rows).toEqual([
      ["code", "name"],
      ["A1", "Baja, 3mm"],
      ["A2", 'Kata "quote"'],
    ]);
  });
  it("membuang baris kosong", () => {
    expect(parseCsv("a,b\n\n  ,  \nc,d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});
