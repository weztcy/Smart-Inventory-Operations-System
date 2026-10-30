import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { listProductionOrders } from "@/lib/services/production";
import { MOCreateForm, type BomOption } from "@/components/production-forms";
import { Card, PageHeader, Badge, TableWrap, Th, Td, EmptyState, statusTone } from "@/components/ui";
import { PRODUCTION_STATUS_LABELS, type ProductionStatus } from "@/lib/constants";
import { formatQty } from "@/lib/decimal";

export const metadata = { title: "Work Order" };

export default async function ProductionOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requirePermission("production.view");
  const sp = await searchParams;
  const canManage = roleHas(ctx.role, "production.manage");
  const mos = await listProductionOrders(ctx.org.id, { status: sp.status });

  const [items, boms, warehouses] = canManage
    ? await Promise.all([
        prisma.item.findMany({
          where: { organizationId: ctx.org.id, isActive: true },
          include: { baseUom: true },
          orderBy: { code: "asc" },
        }),
        prisma.billOfMaterials.findMany({
          where: { organizationId: ctx.org.id, status: "ACTIVE" },
          include: { item: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.warehouse.findMany({ where: { organizationId: ctx.org.id, isActive: true }, orderBy: { code: "asc" } }),
      ])
    : [[], [], []];

  const bomOptions: BomOption[] = boms.map((b) => ({
    id: b.id, code: b.code, productCode: b.item.code, productName: b.item.name, version: b.version,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Order (Production Order)"
        description="Konfirmasi memesan material via reservasi stok; konsumsi dan output aktual dicatat terpisah dari rencana."
        actions={
          canManage ? (
            <MOCreateForm
              items={items.map((i) => ({
                id: i.id, code: i.code, name: i.name,
                uomId: i.baseUomId, uomCode: i.baseUom.code, avgCost: i.avgCost,
              }))}
              boms={bomOptions}
              warehouses={warehouses}
            />
          ) : null
        }
      />

      <div className="flex flex-wrap gap-1.5">
        <Link href="/produksi/orders" className={!sp.status ? "rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white" : "rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}>
          Semua
        </Link>
        {["DRAFT", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((s) => (
          <Link
            key={s}
            href={`/produksi/orders?status=${s}`}
            className={sp.status === s ? "rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white" : "rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}
          >
            {PRODUCTION_STATUS_LABELS[s as ProductionStatus]}
          </Link>
        ))}
      </div>

      <Card>
        {mos.length === 0 ? (
          <EmptyState title="Belum ada work order" description="Buat WO dari BOM aktif melalui tombol di kanan atas." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Nomor MO</Th>
                <Th>Produk</Th>
                <Th>BOM</Th>
                <Th className="text-right">Rencana</Th>
                <Th>Status</Th>
                <Th>PJ</Th>
              </tr>
            </thead>
            <tbody>
              {mos.map((mo) => (
                <tr key={mo.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/produksi/orders/${mo.id}`} className="font-medium text-indigo-600 hover:underline">
                      {mo.number}
                    </Link>
                  </Td>
                  <Td>
                    <span className="font-medium">{mo.item.code}</span>
                    <span className="ml-1.5 text-xs text-slate-500">{mo.item.name}</span>
                  </Td>
                  <Td className="text-xs">{mo.bom.code} v{mo.bom.version}</Td>
                  <Td className="text-right tabular-nums">{formatQty(mo.plannedQty)}</Td>
                  <Td><Badge tone={statusTone(mo.status)}>{PRODUCTION_STATUS_LABELS[mo.status as ProductionStatus] ?? mo.status}</Badge></Td>
                  <Td className="text-xs text-slate-500">{mo.assignedTo ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
