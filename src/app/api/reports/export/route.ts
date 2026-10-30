// Export CSV laporan — mengikuti permission & batas organisasi (PRD §16.6).
import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import {
  exportStockOnHandCsv, exportStockByLocationCsv, exportValuationCsv,
  exportMovementsCsv, exportProductionVarianceCsv, exportScrapCsv, exportAuditCsv,
  exportPurchaseCsv,
} from "@/lib/services/reports";

export const GET = apiRoute(async (req) => {
  const ctx = await requirePermission("report.export");
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "stock";
  const warehouseId = sp.get("warehouseId") ?? undefined;

  let csv: string;
  switch (type) {
    case "stock":
      csv = await exportStockOnHandCsv(ctx.org.id);
      break;
    case "stock-by-location":
      csv = await exportStockByLocationCsv(ctx.org.id, warehouseId);
      break;
    case "valuation":
      csv = await exportValuationCsv(ctx.org.id);
      break;
    case "movements":
      csv = await exportMovementsCsv(ctx.org.id);
      break;
    case "production-variance":
      csv = await exportProductionVarianceCsv(ctx.org.id);
      break;
    case "purchase":
      csv = await exportPurchaseCsv(ctx.org.id);
      break;
    case "scrap":
      csv = await exportScrapCsv(ctx.org.id);
      break;
    case "audit":
      await requirePermission("audit.view");
      csv = await exportAuditCsv(ctx.org.id);
      break;
    default:
      return NextResponse.json({ error: "Jenis export tidak dikenal" }, { status: 400 });
  }

  return new NextResponse("\uFEFF" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
