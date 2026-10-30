import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getValuation, getSlowMovingItems } from "@/lib/inventory/queries";
import { getPurchaseReport, getProductionVarianceReport, getTopConsumedItems, getTopScrapSources } from "@/lib/services/reports";
import { getScrapMetrics } from "@/lib/services/scrap";
import { Card, CardHeader, PageHeader, StatCard, Badge, TableWrap, Th, Td, EmptyState } from "@/components/ui";
import { formatCurrency, formatQty, toDec } from "@/lib/decimal";
import { PRODUCTION_STATUS_LABELS, type ProductionStatus } from "@/lib/constants";

export const metadata = { title: "Laporan" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await requirePermission("report.view");
  const sp = await searchParams;
  const tab = sp.tab ?? "valuasi";

  const tabs = [
    { key: "valuasi", label: "Valuasi Persediaan" },
    { key: "pembelian", label: "Pembelian" },
    { key: "produksi", label: "Variance Produksi" },
    { key: "scrap", label: "Scrap & Efisiensi" },
    { key: "mengendap", label: "Stok Mengendap" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Laporan Operasional" description="Seluruh angka diturunkan dari transaksi sumber dan dapat diekspor ke CSV." />

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/laporan?tab=${t.key}`}
            className={tab === t.key
              ? "rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white"
              : "rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "valuasi" ? <ValuasiReport orgId={ctx.org.id} currency={ctx.org.currency} /> : null}
      {tab === "pembelian" ? <PembelianReport orgId={ctx.org.id} /> : null}
      {tab === "produksi" ? <ProduksiReport orgId={ctx.org.id} /> : null}
      {tab === "scrap" ? <ScrapReport orgId={ctx.org.id} currency={ctx.org.currency} /> : null}
      {tab === "mengendap" ? <MengendapReport orgId={ctx.org.id} /> : null}
    </div>
  );
}

async function ValuasiReport({ orgId, currency }: { orgId: string; currency: string }) {
  const { rows, totalValue } = await getValuation(orgId);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Nilai Persediaan" value={formatCurrency(totalValue, currency)} />
        <StatCard label="Item Bernilai" value={rows.length} />
        <a href="/api/reports/export?type=valuation" className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-indigo-600 shadow-sm hover:bg-slate-50">
          Export Valuasi (CSV)
        </a>
      </div>
      <Card>
        <CardHeader title="Valuasi per Item (Moving Weighted Average)" />
        {rows.length === 0 ? (
          <EmptyState title="Belum ada stok bernilai" />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right">Kuantitas</Th>
                <Th className="text-right">Avg Cost</Th>
                <Th className="text-right">Nilai</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemId} className="hover:bg-slate-50">
                  <Td>
                    <span className="font-medium">{r.code}</span>
                    <span className="ml-1.5 text-xs text-slate-500">{r.name}</span>
                  </Td>
                  <Td className="text-right tabular-nums">{formatQty(r.onHand)} {r.uomCode}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(r.avgCost, currency)}</Td>
                  <Td className="text-right font-medium tabular-nums">{formatCurrency(r.value, currency)}</Td>
                </tr>
              ))}
              <tr className="bg-slate-50">
                <Td className="font-semibold">TOTAL</Td>
                <Td />
                <Td />
                <Td className="text-right font-semibold tabular-nums">{formatCurrency(totalValue, currency)}</Td>
              </tr>
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}

async function PembelianReport({ orgId }: { orgId: string }) {
  const rows = await getPurchaseReport(orgId);
  return (
    <Card>
      <CardHeader
        title="Purchase Order: Dipesan vs Diterima"
        actions={<a href="/api/reports/export?type=purchase" className="text-xs font-medium text-indigo-600 hover:underline">Export CSV</a>}
      />
      {rows.length === 0 ? (
        <EmptyState title="Belum ada purchase order" />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>PO</Th>
              <Th>Supplier</Th>
              <Th>Status</Th>
              <Th className="text-right">Dipesan</Th>
              <Th className="text-right">Diterima</Th>
              <Th className="text-right">Outstanding</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.number} className="hover:bg-slate-50">
                <Td className="font-medium">{r.number}</Td>
                <Td>{r.supplier}</Td>
                <Td>
                  {r.status}
                  {r.isLate ? <Badge tone="red" className="ml-1.5">terlambat</Badge> : null}
                </Td>
                <Td className="text-right tabular-nums">{formatQty(r.ordered)}</Td>
                <Td className="text-right tabular-nums text-emerald-600">{formatQty(r.received)}</Td>
                <Td className="text-right tabular-nums font-medium">{formatQty(r.outstanding)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Card>
  );
}

async function ProduksiReport({ orgId }: { orgId: string }) {
  const rows = await getProductionVarianceReport(orgId);
  return (
    <Card>
      <CardHeader
        title="Variance Produksi: Rencana vs Aktual"
        actions={<a href="/api/reports/export?type=production-variance" className="text-xs font-medium text-indigo-600 hover:underline">Export CSV</a>}
      />
      {rows.length === 0 ? (
        <EmptyState title="Belum ada work order" />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>MO</Th>
              <Th>Produk</Th>
              <Th>Status</Th>
              <Th className="text-right">Output (aktual/rencana)</Th>
              <Th className="text-right">Variance Output</Th>
              <Th className="text-right">Variance Konsumsi Terbesar</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const worst = [...r.components].sort((a, b) => b.variance.abs().comparedTo(a.variance.abs()))[0];
              return (
                <tr key={r.number} className="hover:bg-slate-50">
                  <Td className="font-medium">{r.number}</Td>
                  <Td className="text-xs">{r.product}</Td>
                  <Td className="text-xs">{PRODUCTION_STATUS_LABELS[r.status as ProductionStatus] ?? r.status}</Td>
                  <Td className="text-right tabular-nums">{formatQty(r.totalOutput)} / {Number(r.plannedQty)}</Td>
                  <Td className={`text-right tabular-nums ${r.outputVariance.lt(0) ? "text-red-600" : "text-emerald-600"}`}>
                    {formatQty(r.outputVariance)}
                  </Td>
                  <Td className="text-right text-xs tabular-nums">
                    {worst && !worst.variance.eq(0)
                      ? `${worst.componentCode}: ${worst.variance.gt(0) ? "+" : ""}${formatQty(worst.variance)}`
                      : "—"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </Card>
  );
}

async function ScrapReport({ orgId, currency }: { orgId: string; currency: string }) {
  const [metrics, topConsumed, topScrap] = await Promise.all([
    getScrapMetrics(orgId),
    getTopConsumedItems(orgId),
    getTopScrapSources(orgId),
  ]);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Konsumsi Material" value={`${metrics.totalConsumed.toFixed(2)} unit-catatan`} hint="jumlah kuantitas tercatat (per satuan item)" />
        <StatCard label="Total Scrap Tercatat" value={`${metrics.totalScrap.toFixed(2)} unit-catatan`} />
        <StatCard label="Reusable" value={metrics.byCategory.REUSABLE?.count ?? 0} tone="success" />
        <a href="/api/reports/export?type=scrap" className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-indigo-600 shadow-sm hover:bg-slate-50">
          Export Scrap (CSV)
        </a>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Material Konsumsi Tertinggi" />
          {topConsumed.length === 0 ? (
            <EmptyState title="Belum ada konsumsi" />
          ) : (
            <TableWrap>
              <thead>
                <tr><Th>Item</Th><Th className="text-right">Total Konsumsi</Th></tr>
              </thead>
              <tbody>
                {topConsumed.map((r) => (
                  <tr key={r.item.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="font-medium">{r.item.code}</span>
                      <span className="ml-1.5 text-xs text-slate-500">{r.item.name}</span>
                    </Td>
                    <Td className="text-right tabular-nums">{formatQty(r.qty)} {r.item.baseUom.code}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
        <Card>
          <CardHeader title="Sumber Scrap Tertinggi" />
          {topScrap.length === 0 ? (
            <EmptyState title="Belum ada scrap" />
          ) : (
            <TableWrap>
              <thead>
                <tr><Th>Material</Th><Th className="text-right">Qty Scrap</Th><Th className="text-right">Kejadian</Th></tr>
              </thead>
              <tbody>
                {topScrap.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <Td>
                      <span className="font-medium">{r.source.code}</span>
                      <span className="ml-1.5 text-xs text-slate-500">{r.source.name}</span>
                    </Td>
                    <Td className="text-right tabular-nums">{formatQty(r.qty)} {r.source.baseUom.code}</Td>
                    <Td className="text-right tabular-nums">{r.count}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
      <p className="text-xs text-slate-400">
        Agregasi kuantitas dihitung per satuan item masing-masing — sistem tidak mencampur satuan
        berbeda tanpa konversi yang valid. Estimasi nilai scrap terpisah dari valuasi persediaan
        berbasis moving average.
      </p>
    </>
  );
}

async function MengendapReport({ orgId }: { orgId: string }) {
  const rows = await getSlowMovingItems(orgId, 90);
  return (
    <Card>
      <CardHeader title="Stok Mengendap — tanpa pergerakan ≥ 90 hari" />
      {rows.length === 0 ? (
        <EmptyState title="Tidak ada stok mengendap" description="Semua stok bergerak dalam 90 hari terakhir." />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>Lokasi</Th>
              <Th className="text-right">On Hand</Th>
              <Th>Pergerakan Terakhir</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.itemId}-${r.locationId}-${i}`} className="hover:bg-slate-50">
                <Td>
                  <span className="font-medium">{r.item.code}</span>
                  <span className="ml-1.5 text-xs text-slate-500">{r.item.name}</span>
                </Td>
                <Td className="text-xs">{r.location.code}</Td>
                <Td className="text-right tabular-nums">{formatQty(r.onHandDec)} {r.item.baseUom.code}</Td>
                <Td className="text-xs text-slate-500">
                  {r.lastMovementAt ? new Date(r.lastMovementAt).toLocaleDateString("id-ID") : "tidak pernah"}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Card>
  );
}
