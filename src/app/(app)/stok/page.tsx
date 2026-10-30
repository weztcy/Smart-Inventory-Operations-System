import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getStockRows, getStockByLocation } from "@/lib/inventory/queries";
import { prisma } from "@/lib/db";
import { Card, PageHeader, Badge, TableWrap, Th, Td, EmptyState } from "@/components/ui";
import { formatCurrency, formatQty, computeReorderSuggestion } from "@/lib/decimal";
import { ITEM_TYPE_LABELS, type ItemType } from "@/lib/constants";

export const metadata = { title: "Stok" };

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; low?: string; view?: string; warehouseId?: string }>;
}) {
  const ctx = await requirePermission("item.view");
  const sp = await searchParams;

  const warehouses = await prisma.warehouse.findMany({
    where: { organizationId: ctx.org.id },
    orderBy: { code: "asc" },
  });

  const byLocation = sp.view === "location";
  const rows = byLocation
    ? await getStockByLocation(ctx.org.id, { warehouseId: sp.warehouseId })
    : await getStockRows(ctx.org.id, {
        q: sp.q,
        warehouseId: sp.warehouseId,
        lowStockOnly: sp.low === "1",
      });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stok"
        description="Posisi persediaan terkini — direkonsiliasi dengan ledger transaksi posted."
        actions={
          <a
            href="/api/reports/export?type=stock"
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Export CSV
          </a>
        }
      />

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-center gap-3">
          <div className="min-w-60 flex-1">
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Cari kode atau nama item…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <select
            name="warehouseId"
            defaultValue={sp.warehouseId ?? ""}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Semua gudang</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
            ))}
          </select>
          <input type="hidden" name="view" value={byLocation ? "location" : ""} />
          <label className="flex items-center gap-2 text-sm text-slate-600 select-none cursor-pointer">
            <input type="checkbox" name="low" value="1" defaultChecked={sp.low === "1"} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            Hanya stok menipis
          </label>
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-indigo-700 transition">
            Terapkan
          </button>
          <Link
            href={byLocation ? "/stok" : "/stok?view=location"}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            {byLocation ? "Tampilan: per item" : "Tampilan: per lokasi"}
          </Link>
        </form>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="Belum ada data stok"
            description="Stok muncul setelah transaksi penerimaan atau saldo awal diposting."
          />
        ) : byLocation ? (
          <TableWrap>
            <thead>
              <tr>
                <Th>Gudang</Th>
                <Th>Lokasi</Th>
                <Th>Item</Th>
                <Th className="text-right">On Hand</Th>
                <Th className="text-right">Tercadang</Th>
                <Th className="text-right">Tersedia</Th>
              </tr>
            </thead>
            <tbody>
              {(rows as Awaited<ReturnType<typeof getStockByLocation>>).map((r, i) => (
                <tr key={`${r.itemId}-${r.locationId}-${i}`} className="hover:bg-slate-50">
                  <Td className="text-xs">{r.warehouseCode}</Td>
                  <Td className="text-xs">{r.locationCode} — {r.locationName}</Td>
                  <Td>
                    <Link href={`/stok/${r.itemId}`} className="font-medium text-slate-800 hover:text-indigo-600">{r.itemCode}</Link>
                    <span className="ml-2 text-xs text-slate-500">{r.itemName}</span>
                  </Td>
                  <Td className="text-right tabular-nums">{formatQty(r.onHand)}</Td>
                  <Td className="text-right tabular-nums text-slate-500">{formatQty(r.reserved)}</Td>
                  <Td className="text-right font-medium tabular-nums">{formatQty(r.available)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Tipe</Th>
                <Th className="text-right">On Hand</Th>
                <Th className="text-right">Tercadang</Th>
                <Th className="text-right">Tersedia</Th>
                <Th className="text-right">Avg Cost</Th>
                <Th className="text-right">Nilai</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(rows as Awaited<ReturnType<typeof getStockRows>>).map((r) => {
                const low = r.minStock !== null && r.available.lt(r.minStock);
                const reorder = computeReorderSuggestion(r.available, r.minStock?.toString() ?? null, null);
                return (
                  <tr key={r.itemId} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/stok/${r.itemId}`} className="font-medium text-slate-800 hover:text-indigo-600">{r.code}</Link>
                      <span className="ml-2 text-xs text-slate-500">{r.name}</span>
                      {r.categoryName ? <span className="ml-2 text-[11px] text-slate-400">{r.categoryName}</span> : null}
                    </Td>
                    <Td className="text-xs">{ITEM_TYPE_LABELS[r.type as ItemType] ?? r.type}</Td>
                    <Td className="text-right tabular-nums">{formatQty(r.onHand)} {r.uomCode}</Td>
                    <Td className="text-right tabular-nums text-slate-500">{formatQty(r.reserved)}</Td>
                    <Td className={`text-right font-medium tabular-nums ${low ? "text-red-600" : ""}`}>
                      {formatQty(r.available)}
                    </Td>
                    <Td className="text-right tabular-nums text-slate-500">
                      {Number(r.avgCost) > 0 ? formatCurrency(r.avgCost, ctx.org.currency) : "—"}
                    </Td>
                    <Td className="text-right tabular-nums">{formatCurrency(r.value, ctx.org.currency)}</Td>
                    <Td>
                      {low ? (
                        <Badge tone="red">di bawah minimum</Badge>
                      ) : reorder ? (
                        <Badge tone="yellow">perlu reorder</Badge>
                      ) : (
                        <Badge tone="green">aman</Badge>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
      <p className="text-xs text-slate-400">
        Tersedia = On Hand − Tercadang. Nilai memakai moving weighted average per item organisasi.
      </p>
    </div>
  );
}
