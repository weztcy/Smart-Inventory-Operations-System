import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getMovements } from "@/lib/inventory/queries";
import { prisma } from "@/lib/db";
import { Card, PageHeader, Badge, TableWrap, Th, Td, EmptyState, statusTone } from "@/components/ui";
import { formatCurrency, formatQty, toDec } from "@/lib/decimal";
import { TX_TYPES, TX_TYPE_LABELS, type TxType } from "@/lib/constants";

export const metadata = { title: "Riwayat Pergerakan" };

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; itemId?: string; warehouseId?: string; from?: string; to?: string; page?: string }>;
}) {
  const ctx = await requirePermission("tx.view");
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;

  const [items, warehouses] = await Promise.all([
    prisma.item.findMany({ where: { organizationId: ctx.org.id }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.warehouse.findMany({ where: { organizationId: ctx.org.id }, orderBy: { code: "asc" } }),
  ]);

  const result = await getMovements(ctx.org.id, {
    q: sp.q,
    type: sp.type,
    itemId: sp.itemId,
    warehouseId: sp.warehouseId,
    from: sp.from ? new Date(sp.from) : undefined,
    to: sp.to ? new Date(sp.to + "T23:59:59") : undefined,
    page,
    pageSize: 30,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const qs = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `/pergerakan?${s}` : "/pergerakan";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Riwayat Pergerakan"
        description="Inventory ledger — jejak permanen setiap perubahan stok, termasuk saldo lokasi berjalan."
        actions={
          <a href="/api/reports/export?type=movements" className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Export CSV
          </a>
        }
      />

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-center gap-3">
          <div className="min-w-48 flex-1">
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Cari item / dokumen…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <select
            name="type"
            defaultValue={sp.type ?? ""}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Semua jenis</option>
            {TX_TYPES.map((t) => (
              <option key={t} value={t}>{TX_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <select
            name="itemId"
            defaultValue={sp.itemId ?? ""}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Semua item</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.code}</option>
            ))}
          </select>
          <select
            name="warehouseId"
            defaultValue={sp.warehouseId ?? ""}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Semua gudang</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.code}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Dari:</span>
            <input
              type="date"
              name="from"
              defaultValue={sp.from ?? ""}
              className="w-36 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
            />
            <span>Sampai:</span>
            <input
              type="date"
              name="to"
              defaultValue={sp.to ?? ""}
              className="w-36 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-indigo-700 transition">
              Filter
            </button>
            <Link
              href="/pergerakan"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <Card>
        {result.entries.length === 0 ? (
          <EmptyState title="Tidak ada pergerakan" description="Sesuaikan filter atau lakukan transaksi terlebih dahulu." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Waktu</Th>
                <Th>Dokumen</Th>
                <Th>Jenis</Th>
                <Th>Item</Th>
                <Th>Lokasi</Th>
                <Th className="text-right">Kuantitas</Th>
                <Th className="text-right">Saldo</Th>
                <Th className="text-right">Nilai</Th>
              </tr>
            </thead>
            <tbody>
              {result.entries.map((e) => {
                const qty = toDec(e.quantity);
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap text-xs text-slate-500">
                      {e.createdAt.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </Td>
                    <Td>
                      <Link href={`/transaksi/${e.transactionId}`} className="font-medium text-indigo-600 hover:underline">
                        {e.transaction.number}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={statusTone(e.transaction.status)}>
                        {TX_TYPE_LABELS[e.transaction.type as TxType] ?? e.transaction.type}
                      </Badge>
                    </Td>
                    <Td className="text-xs">
                      <span className="font-medium text-slate-700">{e.item.code}</span> {e.item.name}
                    </Td>
                    <Td className="text-xs">{e.location.code}</Td>
                    <Td className={`text-right font-medium tabular-nums ${qty.gt(0) ? "text-emerald-600" : "text-red-600"}`}>
                      {qty.gt(0) ? "+" : ""}{formatQty(qty)}
                    </Td>
                    <Td className="text-right tabular-nums text-slate-500">{e.runningQty ? formatQty(e.runningQty) : "—"}</Td>
                    <Td className="text-right tabular-nums text-slate-500">{formatCurrency(e.value, ctx.org.currency)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between px-5 py-3 text-xs text-slate-500">
            <span>Halaman {result.page} dari {totalPages} — {result.total} entri</span>
            <div className="flex gap-2">
              {result.page > 1 ? (
                <Link href={qs({ page: String(result.page - 1) })} className="rounded-md bg-white px-2.5 py-1 ring-1 ring-slate-200 hover:bg-slate-50">Sebelumnya</Link>
              ) : null}
              {result.page < totalPages ? (
                <Link href={qs({ page: String(result.page + 1) })} className="rounded-md bg-white px-2.5 py-1 ring-1 ring-slate-200 hover:bg-slate-50">Berikutnya</Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
