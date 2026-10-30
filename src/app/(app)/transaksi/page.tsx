import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleHas } from "@/lib/constants";
import { listTransactions } from "@/lib/services/transactions";
import { TransactionCreate } from "@/components/transaction-create";
import { Card, PageHeader, Badge, TableWrap, Th, Td, EmptyState, statusTone } from "@/components/ui";
import { TX_TYPE_LABELS, TX_TYPES, type TxType } from "@/lib/constants";

export const metadata = { title: "Transaksi Stok" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; page?: string }>;
}) {
  const ctx = await requirePermission("tx.view");
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const result = await listTransactions(ctx.org.id, {
    type: sp.type, status: sp.status, page,
  });

  const [items, locations, suppliers, uoms] = await Promise.all([
    prisma.item.findMany({
      where: { organizationId: ctx.org.id, isActive: true },
      include: { baseUom: true },
      orderBy: { code: "asc" },
    }),
    prisma.storageLocation.findMany({
      where: { organizationId: ctx.org.id, isActive: true },
      include: { warehouse: true },
      orderBy: { code: "asc" },
    }),
    prisma.supplier.findMany({ where: { organizationId: ctx.org.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.unitOfMeasure.findMany({ where: { organizationId: ctx.org.id }, orderBy: { code: "asc" } }),
  ]);

  const canCreate = roleHas(ctx.role, "tx.create") && ctx.org.status === "ACTIVE";
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const qs = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { type: sp.type, status: sp.status, page: sp.page, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `/transaksi?${s}` : "/transaksi";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transaksi Stok"
        description="Seluruh dokumen yang memengaruhi persediaan: penerimaan, pengeluaran, transfer, penyesuaian, dan saldo awal."
        actions={
          canCreate ? (
            <TransactionCreate
              canPost={roleHas(ctx.role, "tx.post")}
              items={items.map((i) => ({ id: i.id, code: i.code, name: i.name, uomId: i.baseUomId, uomCode: i.baseUom.code, avgCost: i.avgCost }))}
              locations={locations.map((l) => ({ id: l.id, code: l.code, name: l.name, warehouseCode: l.warehouse.code }))}
              suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
              uoms={uoms.map((u) => ({ id: u.id, code: u.code, name: u.name }))}
            />
          ) : null
        }
      />

      <div className="flex flex-wrap gap-1.5">
        <Link href={qs({ type: undefined, page: undefined })} className={!sp.type ? "rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white" : "rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}>
          Semua Jenis
        </Link>
        {TX_TYPES.map((t) => (
          <Link
            key={t}
            href={qs({ type: t, page: undefined })}
            className={sp.type === t ? "rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white" : "rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}
          >
            {TX_TYPE_LABELS[t]}
          </Link>
        ))}
        <Link href={qs({ status: sp.status === "DRAFT" ? undefined : "DRAFT", page: undefined })} className={sp.status === "DRAFT" ? "rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white" : "rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}>
          Hanya Draft
        </Link>
      </div>

      <Card>
        {result.rows.length === 0 ? (
          <EmptyState
            title="Belum ada transaksi"
            description="Buat transaksi pertama melalui tombol di kanan atas, atau impor saldo awal dari halaman Import CSV."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Nomor</Th>
                <Th>Jenis</Th>
                <Th>Tanggal</Th>
                <Th className="text-center">Baris</Th>
                <Th>Status</Th>
                <Th>Dibuat Oleh</Th>
                <Th>Referensi</Th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/transaksi/${t.id}`} className="font-medium text-indigo-600 hover:underline">
                      {t.number}
                    </Link>
                  </Td>
                  <Td>{TX_TYPE_LABELS[t.type as TxType] ?? t.type}</Td>
                  <Td className="whitespace-nowrap text-xs text-slate-500">
                    {new Date(t.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                  </Td>
                  <Td className="text-center tabular-nums">{t._count.lines}</Td>
                  <Td><Badge tone={statusTone(t.status)}>{t.status}</Badge></Td>
                  <Td className="text-xs text-slate-500">{t.createdBy.name}</Td>
                  <Td className="text-xs text-slate-500">{t.refNumber ?? t.reference ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between px-5 py-3 text-xs text-slate-500">
            <span>Halaman {result.page} dari {totalPages} — {result.total} transaksi</span>
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
