// Konversi satuan ke base unit item (PRD §6.5).
import { prisma, type Db } from "@/lib/db";
import { notFound, badRequest } from "@/lib/errors";
import { Decimal } from "@/lib/decimal";

/**
 * Konversi kuantitas dari `uomId` ke base unit item.
 * Konversi hanya valid bila relasi satuan diketahui eksplisit
 * (langsung maupun kebalikannya); tidak ada perkiraan otomatis.
 */
export async function convertToBaseUnit(
  db: Db,
  orgId: string,
  itemId: string,
  uomId: string,
  qty: Decimal,
): Promise<Decimal> {
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { id: true, organizationId: true, baseUomId: true, code: true },
  });
  if (!item || item.organizationId !== orgId) throw notFound("Item tidak ditemukan.");
  if (item.baseUomId === uomId) return qty;

  const direct = await db.uomConversion.findFirst({
    where: { organizationId: orgId, fromUomId: uomId, toUomId: item.baseUomId },
  });
  if (direct) return qty.times(new Decimal(direct.factor));

  const inverse = await db.uomConversion.findFirst({
    where: { organizationId: orgId, fromUomId: item.baseUomId, toUomId: uomId },
  });
  if (inverse) {
    const factor = new Decimal(inverse.factor);
    if (factor.lte(0)) throw badRequest("Faktor konversi satuan tidak valid.");
    return qty.div(factor);
  }

  throw badRequest(
    `Konversi satuan untuk item ${item.code} tidak dikenal. Definisikan konversinya di master satuan.`,
  );
}
