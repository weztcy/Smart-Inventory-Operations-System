import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getDashboardMetrics, getLowStockItems } from "@/lib/inventory/queries";
import { Card, CardHeader, PageHeader, StatCard, Badge, TableWrap, Th, Td, EmptyState, statusTone } from "@/components/ui";
import { formatCurrency, formatQty, toDec } from "@/lib/decimal";
import { TX_TYPE_LABELS, type TxType } from "@/lib/constants";

export const metadata = { title: "Dashboard" };

function fmtDate(d: Date) {
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function DashboardPage() {
  const ctx = await requireSession();
  const [m, lowStock] = await Promise.all([
    getDashboardMetrics(ctx.org.id),
    getLowStockItems(ctx.org.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Selamat datang, ${ctx.user.name.split(" ")[0]}`}
        description={`Ringkasan operasional ${ctx.org.name} — seluruh angka dihitung dari transaksi nyata.`}
        actions={
          <Link href="/transaksi" className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            + Transaksi Baru
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Nilai Persediaan"
          value={formatCurrency(m.totalValue, ctx.org.currency)}
          hint={`${m.totalItems} item memiliki stok`}
        />
        <StatCard
          label="Item Aktif"
          value={m.activeItems}
          hint="master item berstatus aktif"
        />
        <StatCard
          label="Stok Menipis"
          value={m.lowStockCount}
          tone={m.lowStockCount > 0 ? "warning" : "success"}
          hint="di bawah ambang minimum"
        />
        <StatCard
          label="Transaksi Draft"
          value={m.pendingTxs}
          tone={m.pendingTxs > 0 ? "warning" : "default"}
          hint="menunggu posting"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="PO Terbuka" value={m.openPOs} hint="pesanan belum diterima penuh" />
        <StatCard label="Work Order Aktif" value={m.activeProductions} hint="dikonfirmasi / berlangsung" />
        <StatCard label="Konsumsi 30 Hari" value={m.consumed30} hint="transaksi konsumsi material" />
        <StatCard label="Hasil Produksi 30 Hari" value={m.produced30} hint="transaksi output" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Pergerakan Stok Terbaru"
            actions={<Link href="/pergerakan" className="text-xs font-medium text-indigo-600 hover:underline">Lihat semua</Link>}
          />
          {m.recentLedger.length === 0 ? (
            <EmptyState
              title="Belum ada pergerakan stok"
              description="Mulai dengan mencatat saldo awal, menerima barang dari supplier, atau membuat PO."
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Waktu</Th>
                  <Th>Dokumen</Th>
                  <Th>Item</Th>
                  <Th className="text-right">Kuantitas</Th>
                </tr>
              </thead>
              <tbody>
                {m.recentLedger.map((e) => {
                  const qty = toDec(e.quantity);
                  return (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <Td className="whitespace-nowrap text-xs text-slate-500">{fmtDate(e.createdAt)}</Td>
                      <Td>
                        <p className="font-medium text-slate-800">{e.transaction.number}</p>
                        <p className="text-xs text-slate-500">{TX_TYPE_LABELS[e.transaction.type as TxType] ?? e.transaction.type}</p>
                      </Td>
                      <Td>
                        <p className="font-medium text-slate-800">{e.item.code}</p>
                        <p className="text-xs text-slate-500">{e.item.name}</p>
                      </Td>
                      <Td className={`text-right font-medium tabular-nums ${qty.gt(0) ? "text-emerald-600" : "text-red-600"}`}>
                        {qty.gt(0) ? "+" : ""}{formatQty(qty)} {e.item.baseUom.code}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Alert Aktif" />
            {m.activeAlerts.length === 0 ? (
              <EmptyState title="Tidak ada alert" description="Semua stok berada di atas ambang minimum." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {m.activeAlerts.slice(0, 6).map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs leading-relaxed text-slate-600">{a.message}</p>
                      <Badge tone="yellow">aktif</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Scrap"
              actions={<Link href="/scrap" className="text-xs font-medium text-indigo-600 hover:underline">Kelola</Link>}
            />
            <ul className="divide-y divide-slate-100 text-sm">
              <li className="flex items-center justify-between px-5 py-2.5">
                <span className="text-slate-600">Reusable</span>
                <span className="font-semibold tabular-nums">{m.scrapCounts.REUSABLE ?? 0}</span>
              </li>
              <li className="flex items-center justify-between px-5 py-2.5">
                <span className="text-slate-600">Saleable</span>
                <span className="font-semibold tabular-nums">{m.scrapCounts.SALEABLE ?? 0}</span>
              </li>
              <li className="flex items-center justify-between px-5 py-2.5">
                <span className="text-slate-600">Pending Assessment</span>
                <span className="font-semibold tabular-nums">{m.scrapCounts.PENDING ?? 0}</span>
              </li>
              <li className="flex items-center justify-between px-5 py-2.5">
                <span className="text-slate-600">Sudah Dibuang</span>
                <span className="font-semibold tabular-nums">{m.scrapCounts.DISPOSAL ?? 0}</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      {lowStock.length > 0 ? (
        <Card>
          <CardHeader
            title="Item Perlu Reorder"
            actions={<Link href="/stok?low=1" className="text-xs font-medium text-indigo-600 hover:underline">Lihat semua</Link>}
          />
          <TableWrap>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right">Tersedia</Th>
                <Th className="text-right">Minimum</Th>
                <Th className="text-right">Kekurangan</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {lowStock.slice(0, 8).map((r) => (
                <tr key={r.itemId} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/stok/${r.itemId}`} className="font-medium text-slate-800 hover:text-indigo-600">
                      {r.code}
                    </Link>
                    <span className="ml-2 text-xs text-slate-500">{r.name}</span>
                  </Td>
                  <Td className="text-right tabular-nums">{formatQty(r.available)} {r.uomCode}</Td>
                  <Td className="text-right tabular-nums">{formatQty(r.minStock!)}</Td>
                  <Td className="text-right font-medium tabular-nums text-red-600">{formatQty(r.shortfall)}</Td>
                  <Td><Badge tone={statusTone("PENDING")}>reorder</Badge></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      ) : null}
    </div>
  );
}
