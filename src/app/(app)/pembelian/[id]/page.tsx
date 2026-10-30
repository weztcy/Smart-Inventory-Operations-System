import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { getPurchaseOrder } from "@/lib/services/purchase";
import { POActionButton, POReceiveForm } from "@/components/po-forms";
import { Card, CardHeader, PageHeader, Badge, TableWrap, Th, Td, statusTone } from "@/components/ui";
import { formatCurrency, toDec } from "@/lib/decimal";

export const metadata = { title: "Detail PO" };

export default async function PODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("po.view");
  const { id } = await params;
  const { po, receipts } = await getPurchaseOrder(ctx.org.id, id);
  if (!po) notFound();

  const canManage = roleHas(ctx.role, "po.manage");
  const canApprove = roleHas(ctx.role, "tx.approve");
  const canReceive = roleHas(ctx.role, "tx.post") && ctx.org.status === "ACTIVE";
  const receivable = ["SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED"].includes(po.status);

  const locations = await prisma.storageLocation.findMany({
    where: { organizationId: ctx.org.id, isActive: true },
    include: { warehouse: true },
    orderBy: { code: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`PO ${po.number}`}
        description={`${po.supplier.name} • Dibuat ${new Date(po.orderDate).toLocaleDateString("id-ID")}${po.expectedDate ? ` • Estimasi tiba ${new Date(po.expectedDate).toLocaleDateString("id-ID")}` : ""}`}
        actions={
          <>
            <Link href="/pembelian" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              ← Kembali
            </Link>
            {po.status === "DRAFT" && canManage ? (
              <POActionButton poId={po.id} action="submit" label="Submit" />
            ) : null}
            {po.status === "SUBMITTED" && canApprove ? (
              <POActionButton poId={po.id} action="approve" label="Setujui" variant="success" />
            ) : null}
            {receivable && canReceive ? (
              <POReceiveForm
                poId={po.id}
                lines={po.lines.map((l) => ({
                  poLineId: l.id,
                  itemCode: l.item.code,
                  itemName: l.item.name,
                  uomCode: l.item.baseUom.code,
                  orderedQty: l.orderedQty,
                  receivedQty: l.receivedQty,
                  unitPrice: l.unitPrice,
                }))}
                locations={locations.map((l) => ({
                  id: l.id,
                  label: `${l.warehouse.code} / ${l.code} — ${l.name}`,
                }))}
              />
            ) : null}
            {["DRAFT", "SUBMITTED", "APPROVED"].includes(po.status) && canManage ? (
              <POActionButton
                poId={po.id} action="cancel" label="Batalkan" variant="danger"
                confirmText="Batalkan PO ini? PO yang sudah menerima barang tidak dapat dibatalkan."
              />
            ) : null}
          </>
        }
      />

      <div className="flex items-center gap-3">
        <Badge tone={statusTone(po.status)}>{po.status.replace("_", " ")}</Badge>
        {po.approvedAt ? (
          <span className="text-xs text-slate-500">
            Disetujui {new Date(po.approvedAt).toLocaleDateString("id-ID")}
          </span>
        ) : null}
      </div>

      <Card>
        <CardHeader title="Baris Pesanan" />
        <TableWrap>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th className="text-right">Dipesan</Th>
              <Th className="text-right">Harga Satuan</Th>
              <Th className="text-right">Nilai</Th>
              <Th className="text-right">Diterima</Th>
              <Th className="text-right">Sisa</Th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l) => {
              const rem = toDec(l.orderedQty).minus(toDec(l.receivedQty));
              return (
                <tr key={l.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/stok/${l.itemId}`} className="font-medium text-slate-800 hover:text-indigo-600">{l.item.code}</Link>
                    <span className="ml-2 text-xs text-slate-500">{l.item.name}</span>
                  </Td>
                  <Td className="text-right tabular-nums">{toDec(l.orderedQty).toNumber()} {l.item.baseUom.code}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(l.unitPrice, ctx.org.currency)}</Td>
                  <Td className="text-right tabular-nums">
                    {formatCurrency(toDec(l.orderedQty).times(toDec(l.unitPrice)), ctx.org.currency)}
                  </Td>
                  <Td className="text-right tabular-nums text-emerald-600">{toDec(l.receivedQty).toNumber()}</Td>
                  <Td className={`text-right tabular-nums ${rem.gt(0) ? "font-medium" : "text-slate-400"}`}>{rem.toNumber()}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </Card>

      <Card>
        <CardHeader title="Riwayat Penerimaan" />
        {receipts.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-500">Belum ada penerimaan.</p>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Nomor Receipt</Th>
                <Th>Tanggal</Th>
                <Th className="text-right">Nilai</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/transaksi/${r.id}`} className="font-medium text-indigo-600 hover:underline">{r.number}</Link>
                  </Td>
                  <Td className="text-xs text-slate-500">
                    {r.postedAt ? new Date(r.postedAt).toLocaleString("id-ID") : "—"}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatCurrency(r.lines.reduce((a, l) => a + Number(toDec(l.value)), 0), ctx.org.currency)}
                  </Td>
                  <Td><Badge tone={statusTone(r.status)}>{r.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {po.notes ? (
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Catatan</p>
          <p className="mt-1.5 text-sm text-slate-700">{po.notes}</p>
        </Card>
      ) : null}
    </div>
  );
}
