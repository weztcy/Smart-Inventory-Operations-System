// Aritmetika desimal presisi untuk kuantitas dan nilai finansial.
// SQLite (dev) menyimpan angka sebagai string desimal ternormalisasi;
// PostgreSQL (produksi) dapat memakai tipe Decimal asli — helper di file ini
// menjadi satu-satunya titik konversi.
import Decimal from "decimal.js";

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export const QTY_DP = 4; // presisi kuantitas
export const COST_DP = 6; // presisi biaya satuan
export const VALUE_DP = 4; // presisi nilai total

export const ZERO = new Decimal(0);

export function toDec(
  v: string | number | Decimal | null | undefined,
): Decimal {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  if (v instanceof Decimal) return v;
  return new Decimal(v);
}

export function isDec(v: unknown): v is Decimal {
  return v instanceof Decimal;
}

/** Normalisasi ke string penyimpanan dengan presisi tetap. */
export function storeQty(v: string | number | Decimal): string {
  return toDec(v).toDecimalPlaces(QTY_DP).toFixed(QTY_DP);
}

export function storeCost(v: string | number | Decimal): string {
  return toDec(v).toDecimalPlaces(COST_DP).toFixed(COST_DP);
}

export function storeValue(v: string | number | Decimal): string {
  return toDec(v).toDecimalPlaces(VALUE_DP).toFixed(VALUE_DP);
}

export function sumDec(values: (string | number | Decimal | null | undefined)[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(toDec(v)), new Decimal(0));
}

/** Format tampilan Indonesia. */
export function formatNumber(v: string | number | Decimal | null | undefined, dp = 2): string {
  const d = toDec(v).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP);
  return d.toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function formatQty(v: string | number | Decimal | null | undefined): string {
  const d = toDec(v);
  // Buang nol di belakang koma untuk tampilan yang ramah (12.5000 -> 12.5)
  const s = d.toDecimalPlaces(QTY_DP).toFixed(QTY_DP).replace(/\.?0+$/, "");
  return s === "" || s === "-" ? "0" : s.replace(".", ",");
}

export function formatCurrency(
  v: string | number | Decimal | null | undefined,
  currency = "IDR",
): string {
  const d = toDec(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (currency === "IDR") {
    const s = d.toDecimalPlaces(0).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `Rp ${s}`;
  }
  return `${currency} ${d.toFixed(2)}`;
}

/** Rata-rata bergerak (moving weighted average) — PRD §8.5.
 *  newAvg = (prevQty*prevAvg + qty*unitCost) / (prevQty + qty)
 *  Menangani: stok awal nol, biaya nol, qty negatif (koreksi/reversal),
 *  dan denominator <= 0 (pertahankan avg sebelumnya). */
export function computeMovingAverage(
  prevQty: string | number | Decimal,
  prevAvg: string | number | Decimal,
  qty: string | number | Decimal,
  unitCost: string | number | Decimal,
): { newAvg: Decimal; newQty: Decimal } {
  const q0 = toDec(prevQty);
  const a0 = toDec(prevAvg);
  const q = toDec(qty);
  const c = toDec(unitCost);
  const newQty = q0.plus(q);
  if (newQty.lte(0)) {
    // Stok habis / menjadi nol — avg tidak bermakna; pertahankan agar tidak
    // muncul NaN. Saat stok masuk berikutnya avg dihitung ulang.
    return { newAvg: newQty.eq(0) ? new Decimal(0) : a0, newQty };
  }
  const newValue = q0.times(a0).plus(q.times(c));
  return { newAvg: newValue.div(newQty), newQty };
}

/** Saran reorder deterministik — PRD §15.2. */
export function computeReorderSuggestion(
  available: string | number | Decimal,
  minStock: string | number | Decimal | null,
  reorderQty: string | number | Decimal | null,
  onOrder: string | number | Decimal = 0,
): Decimal | null {
  if (minStock === null || minStock === undefined) return null;
  const needed = toDec(minStock).minus(toDec(available)).minus(toDec(onOrder));
  if (needed.lte(0)) return null;
  return toDec(reorderQty ?? 0).gt(0) ? toDec(reorderQty) : needed;
}
