import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { getTransactionDetail } from "@/lib/services/transactions";
import { PostButton, CancelDraftButton, ReverseButton } from "@/components/transaction-actions";
import { Card, CardHeader, PageHeader, Badge, TableWrap, Th, Td, statusTone } from "@/components/ui";
import { formatCurrency, formatQty, toDec } from "@/lib/decimal";
import { TX_TYPE_LABELS, type TxType } from "@/lib/constants";

export const metadata = { title: "Detail Transaksi" };

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePermission("tx.view");
  const { id } = await params;
  const tx = await getTransactionDetail(ctx.org.id, id);
  if (!tx) notFound();

  const canPost = roleHas(ctx.role, "tx.post") && ctx.org.status === "ACTIVE";
  const canCancel = roleHas(ctx.role, "tx.create") && ctx.org.status === "ACTIVE";
  const canReverse = roleHas(ctx.role, "tx.reverse") && ctx.org.status === "ACTIVE";

  const issueType = tx.reason?.startsWith("issue-type:")
    ? tx.reason.slice("issue-type:".length)
    : null;
  const supplierId = tx.reason?.startsWith("supplier:") ? tx.reason.slice("supplier:".length) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${TX_TYPE_LABELS[tx.type as TxType] ?? tx.type} ${tx.number}`}
        description={`Status: ${tx.status} • Dibuat ${tx.createdBy?.name ?? "-"}${tx.postedBy ? ` • Diposting ${tx.postedBy.name}` : ""}`}
        actions={
          <>
            <Link href="/transaksi" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              ← Kembali
            </Link>
            {tx.status === "DRAFT" && canPost ? <PostButton txId={tx.id} /> : null}
            {tx.status === "DRAFT" && canCancel ? <CancelDraftButton txId={tx.id} /> : null}
            {tx.status === "POSTED" && canReverse ? <ReverseButton txId={tx.id} number={tx.number} /> : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Status</p>
          <div className="mt-2"><Badge tone={statusTone(tx.status)}>{tx.status}</Badge></div>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Tanggal Dokumen</p>
          <p className="mt-2 text-sm font-medium">
            {new Date(tx.date).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Referensi</p>
          <p className="mt-2 text-sm font-medium">{tx.refNumber ?? tx.reference ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Nilai Total</p>
          <p className="mt-2 text-sm font-medium tabular-nums">
            {formatCurrency(tx.lines.reduce((a, l) => a + Number(toDec(l.value)), 0), ctx.org.currency)}
          </p>
        </Card>
      </div>

      {issueType || supplierId !== null || tx.reversalOfId ? (
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          {issueType ? <Badge tone="blue">Jenis: {issueType}</Badge> : null}
          {supplierId !== null ? <Badge tone="purple">{supplierId === "direct-receiving" ? "Penerimaan langsung" : "Berbasis supplier"}</Badge> : null}
          {tx.reversalOf ? <Badge tone="gray">Reversal atas {tx.reversalOf.number}</Badge> : null}
          {tx.reversals.length > 0 ? (
            <Badge tone="gray">Di-reverse oleh {tx.reversals.map((r) => r.number).join(", ")}</Badge>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader title="Baris Transaksi" />
        <TableWrap>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>Lokasi</Th>
              <Th className="text-right">Kuantitas (base)</Th>
              <Th className="text-right">Biaya Satuan</Th>
              <Th className="text-right">Nilai</Th>
            </tr>
          </thead>
          <tbody>
            {tx.lines.map((l) => {
              const qty = toDec(l.quantity);
              return (
                <tr key={l.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/stok/${l.itemId}`} className="font-medium text-slate-800 hover:text-indigo-600">
                      {l.item.code}
                    </Link>
                    <span className="ml-2 text-xs text-slate-500">{l.item.name}</span>
                  </Td>
                  <Td className="text-xs">{l.location.code}</Td>
                  <Td className={`text-right font-medium tabular-nums ${qty.gt(0) ? "text-emerald-600" : "text-red-600"}`}>
                    {qty.gt(0) ? "+" : ""}{formatQty(qty)} {l.item.baseUom.code}
                  </Td>
                  <Td className="text-right tabular-nums text-slate-500">
                    {l.unitCost ? formatCurrency(l.unitCost, ctx.org.currency) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {Number(toDec(l.value)) !== 0 ? formatCurrency(l.value, ctx.org.currency) : "—"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
        {tx.status === "DRAFT" ? (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-amber-600">
            Draft: kuantitas di atas bersifat rencana. Biaya dan nilai final dihitung saat posting.
          </p>
        ) : null}
      </Card>

      {tx.notes ? (
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Catatan</p>
          <p className="mt-1.5 text-sm text-slate-700">{tx.notes}</p>
        </Card>
      ) : null}
    </div>
  );
}
