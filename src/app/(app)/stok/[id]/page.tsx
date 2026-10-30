import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getItemStockDetail } from "@/lib/inventory/queries";
import { Card, CardHeader, PageHeader, Badge, TableWrap, Th, Td, EmptyState } from "@/components/ui";
import { formatCurrency, formatQty, toDec } from "@/lib/decimal";
import { ITEM_TYPE_LABELS, TX_TYPE_LABELS, type ItemType, type TxType } from "@/lib/constants";

export const metadata = { title: "Detail Item" };

export default async function ItemStockPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("item.view");
  const { id } = await params;
  const data = await getItemStockDetail(ctx.org.id, id);
  if (!data) notFound();

  const { item, balances, movements } = data;
  const totalOnHand = balances.reduce((a, b) => a.plus(toDec(b.onHand)), toDec(0));
  const totalReserved = balances.reduce((a, b) => a.plus(toDec(b.reserved)), toDec(0));
  const available = totalOnHand.minus(totalReserved);
  const low = item.minStock && available.lt(toDec(item.minStock));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${item.code} — ${item.name}`}
        description={`${ITEM_TYPE_LABELS[item.type as ItemType] ?? item.type} • Satuan dasar: ${item.baseUom.code}${item.category ? ` • Kategori: ${item.category.name}` : ""}`}
        actions={
          <>
            <Link href="/stok" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              ← Daftar Stok
            </Link>
            <Link href={`/items?focus=${item.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Edit Master
            </Link>
          </>
        }
      />

      {!item.isActive ? (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Item ini berstatus <strong>nonaktif</strong> dan tidak dapat dipakai dalam transaksi baru
          (kecuali reversal yang sah).
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Total On Hand</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatQty(totalOnHand)} {item.baseUom.code}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Tercadang</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-500">{formatQty(totalReserved)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Tersedia</p>
          <p className={`mt-2 text-2xl font-semibold tabular-nums ${low ? "text-red-600" : ""}`}>{formatQty(available)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Avg Cost / Nilai</p>
          <p className="mt-2 text-sm font-semibold tabular-nums">
            {formatCurrency(item.avgCost, ctx.org.currency)}
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            Nilai: {formatCurrency(totalOnHand.times(toDec(item.avgCost)), ctx.org.currency)}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Stok per Lokasi" />
        {balances.filter((b) => toDec(b.onHand).gt(0) || toDec(b.reserved).gt(0)).length === 0 ? (
          <EmptyState title="Belum ada stok" description="Item ini belum memiliki saldo di lokasi mana pun." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Gudang</Th>
                <Th>Lokasi</Th>
                <Th className="text-right">On Hand</Th>
                <Th className="text-right">Tercadang</Th>
                <Th className="text-right">Tersedia</Th>
              </tr>
            </thead>
            <tbody>
              {balances
                .filter((b) => toDec(b.onHand).gt(0) || toDec(b.reserved).gt(0))
                .map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <Td className="text-xs">{b.location.warehouse.code} — {b.location.warehouse.name}</Td>
                    <Td className="text-xs">{b.location.code} — {b.location.name}</Td>
                    <Td className="text-right tabular-nums">{formatQty(b.onHand)}</Td>
                    <Td className="text-right tabular-nums text-slate-500">{formatQty(b.reserved)}</Td>
                    <Td className="text-right font-medium tabular-nums">
                      {formatQty(toDec(b.onHand).minus(toDec(b.reserved)))}
                    </Td>
                  </tr>
                ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader title="Riwayat Pergerakan (50 terakhir)" />
        {movements.length === 0 ? (
          <EmptyState title="Belum ada pergerakan" />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Waktu</Th>
                <Th>Dokumen</Th>
                <Th className="text-right">Kuantitas</Th>
                <Th className="text-right">Saldo Lokasi</Th>
                <Th className="text-right">Nilai</Th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => {
                const qty = toDec(m.quantity);
                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap text-xs text-slate-500">
                      {m.createdAt.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </Td>
                    <Td>
                      <Link href={`/transaksi/${m.transactionId}`} className="font-medium text-indigo-600 hover:underline">
                        {m.transaction.number}
                      </Link>
                      <span className="ml-2 text-xs text-slate-500">
                        {TX_TYPE_LABELS[m.transaction.type as TxType] ?? m.transaction.type}
                      </span>
                      {m.transaction.status === "REVERSED" ? <Badge tone="gray" className="ml-1.5">reversed</Badge> : null}
                    </Td>
                    <Td className={`text-right font-medium tabular-nums ${qty.gt(0) ? "text-emerald-600" : "text-red-600"}`}>
                      {qty.gt(0) ? "+" : ""}{formatQty(qty)}
                    </Td>
                    <Td className="text-right tabular-nums text-slate-500">
                      {m.runningQty ? formatQty(m.runningQty) : "—"}
                    </Td>
                    <Td className="text-right tabular-nums text-slate-500">
                      {formatCurrency(m.value, ctx.org.currency)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {item.description || item.notes ? (
        <Card className="p-4">
          {item.description ? (
            <>
              <p className="text-xs font-medium uppercase text-slate-500">Deskripsi</p>
              <p className="mt-1 text-sm text-slate-700">{item.description}</p>
            </>
          ) : null}
          {item.notes ? (
            <>
              <p className="mt-3 text-xs font-medium uppercase text-slate-500">Catatan</p>
              <p className="mt-1 text-sm text-slate-700">{item.notes}</p>
            </>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
