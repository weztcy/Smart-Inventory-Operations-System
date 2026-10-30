import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { listPurchaseOrders } from "@/lib/services/purchase";
import { POCreateForm } from "@/components/po-forms";
import { Card, PageHeader, Badge, TableWrap, Th, Td, EmptyState, statusTone } from "@/components/ui";
import { formatCurrency, toDec, sumDec } from "@/lib/decimal";

export const metadata = { title: "Pembelian" };

export default async function PurchasingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const ctx = await requirePermission("po.view");
  const sp = await searchParams;
  const canManage = roleHas(ctx.role, "po.manage");

  const result = await listPurchaseOrders(ctx.org.id, {
    status: sp.status,
    page: Number(sp.page ?? "1") || 1,
  });

  const [suppliers, items, warehouses] = canManage
    ? await Promise.all([
        prisma.supplier.findMany({ where: { organizationId: ctx.org.id, isActive: true }, orderBy: { name: "asc" } }),
        prisma.item.findMany({ where: { organizationId: ctx.org.id, isActive: true }, include: { baseUom: true }, orderBy: { code: "asc" } }),
        prisma.warehouse.findMany({ where: { organizationId: ctx.org.id, isActive: true }, orderBy: { code: "asc" } }),
      ])
    : [[], [], []];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Order"
        description="Pesan barang ke supplier, setujui, dan terima secara parsial — stok bertambah hanya saat penerimaan diposting."
        actions={
          canManage ? (
            <POCreateForm
              suppliers={suppliers}
              items={items.map((i) => ({ id: i.id, code: i.code, name: i.name, uomId: i.baseUomId, uomCode: i.baseUom.code, avgCost: i.avgCost }))}
              warehouses={warehouses}
            />
          ) : null
        }
      />

      <div className="flex flex-wrap gap-1.5">
        <Link
          href="/pembelian"
          className={!sp.status ? "rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white" : "rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}
        >
          Semua
        </Link>
        {["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"].map((s) => (
          <Link
            key={s}
            href={`/pembelian?status=${s}`}
            className={sp.status === s ? "rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white" : "rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}
          >
            {s.replace("_", " ")}
          </Link>
        ))}
      </div>

      <Card>
        {result.rows.length === 0 ? (
          <EmptyState title="Belum ada purchase order" description="Buat PO pertama melalui tombol di kanan atas." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Nomor PO</Th>
                <Th>Supplier</Th>
                <Th>Tanggal</Th>
                <Th>Estimasi</Th>
                <Th className="text-right">Total Nilai</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((po) => {
                const total = po.lines.reduce(
                  (a, l) => a.plus(toDec(l.orderedQty).times(toDec(l.unitPrice))),
                  sumDec([]),
                );
                const late =
                  po.expectedDate &&
                  po.expectedDate < new Date() &&
                  po.status !== "RECEIVED" &&
                  po.status !== "CANCELLED" &&
                  po.lines.some((l) => toDec(l.receivedQty).lt(toDec(l.orderedQty)));
                return (
                  <tr key={po.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/pembelian/${po.id}`} className="font-medium text-indigo-600 hover:underline">
                        {po.number}
                      </Link>
                    </Td>
                    <Td>{po.supplier.name}</Td>
                    <Td className="text-xs text-slate-500">
                      {new Date(po.orderDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {po.expectedDate
                        ? new Date(po.expectedDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })
                        : "—"}
                      {late ? <Badge tone="red" className="ml-1.5">terlambat</Badge> : null}
                    </Td>
                    <Td className="text-right tabular-nums">{formatCurrency(total, ctx.org.currency)}</Td>
                    <Td><Badge tone={statusTone(po.status)}>{po.status.replace("_", " ")}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
