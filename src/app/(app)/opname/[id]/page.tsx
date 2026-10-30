import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { getStockCountDetail } from "@/lib/services/opname";
import { CountSheet, OpnameCancelButton } from "@/components/opname-client";
import { Card, PageHeader, Badge, TableWrap, Th, Td, statusTone } from "@/components/ui";
import { formatQty, toDec } from "@/lib/decimal";

export const metadata = { title: "Detail Stock Count" };

export default async function OpnameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("tx.view");
  const { id } = await params;
  const count = await getStockCountDetail(ctx.org.id, id);
  if (!count) notFound();

  const canManage = roleHas(ctx.role, "opname.manage") && ctx.org.status === "ACTIVE";
  const editable = count.status === "IN_PROGRESS" && canManage;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Stock Count ${count.number}`}
        description={`${count.warehouse.code} — ${count.warehouse.name} • Dimulai ${new Date(count.startedAt).toLocaleString("id-ID")}`}
        actions={
          <>
            <Link href="/opname" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              ← Kembali
            </Link>
            {editable ? <OpnameCancelButton countId={count.id} /> : null}
            {count.adjustmentTransactionId ? (
              <Link href={`/transaksi/${count.adjustmentTransactionId}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Lihat Transaksi Penyesuaian
              </Link>
            ) : null}
          </>
        }
      />

      <div><Badge tone={statusTone(count.status)}>{count.status}</Badge></div>

      {count.status === "RECONCILED" ? (
        <Card>
          <div className="border-b border-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-800">
            Hasil Rekonsiliasi
          </div>
          <TableWrap>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Lokasi</Th>
                <Th className="text-right">Baseline</Th>
                <Th className="text-right">Hitung Fisik</Th>
                <Th className="text-right">Stok Saat Rekonsiliasi</Th>
                <Th className="text-right">Penyesuaian</Th>
              </tr>
            </thead>
            <tbody>
              {count.lines.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <Td>
                    <span className="font-medium">{l.item.code}</span>
                    <span className="ml-1.5 text-xs text-slate-500">{l.item.name}</span>
                  </Td>
                  <Td className="text-xs">{l.location.code}</Td>
                  <Td className="text-right tabular-nums text-slate-500">{formatQty(l.baselineQty)}</Td>
                  <Td className="text-right tabular-nums">{l.countedQty ? formatQty(l.countedQty) : "—"}</Td>
                  <Td className="text-right tabular-nums text-slate-500">
                    {l.systemQtyAtReconcile ? formatQty(l.systemQtyAtReconcile) : "—"}
                  </Td>
                  <Td className={`text-right font-medium tabular-nums ${toDec(l.adjustedQty ?? 0).eq(0) ? "text-slate-400" : toDec(l.adjustedQty ?? 0).gt(0) ? "text-emerald-600" : "text-red-600"}`}>
                    {l.adjustedQty ? (toDec(l.adjustedQty).gt(0) ? "+" : "") + formatQty(l.adjustedQty) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      ) : (
        <Card>
          <div className="border-b border-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-800">
            Lembar Hitung {editable ? "— isi hasil hitung fisik" : ""}
          </div>
          <div className="p-5">
            <CountSheet
              countId={count.id}
              editable={editable}
              lines={count.lines.map((l) => ({
                lineId: l.id,
                itemCode: l.item.code,
                itemName: l.item.name,
                uomCode: l.item.baseUom.code,
                locationCode: l.location.code,
                baselineQty: l.baselineQty,
                countedDisplay: l.countedQty ? formatQty(l.countedQty) : "—",
              }))}
            />
          </div>
        </Card>
      )}

      {count.notes ? (
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Catatan</p>
          <p className="mt-1.5 text-sm text-slate-700">{count.notes}</p>
        </Card>
      ) : null}
    </div>
  );
}
