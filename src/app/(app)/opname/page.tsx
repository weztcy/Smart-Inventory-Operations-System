import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { listStockCounts } from "@/lib/services/opname";
import { OpnameCreateForm } from "@/components/opname-client";
import { Card, PageHeader, Badge, TableWrap, Th, Td, EmptyState, statusTone } from "@/components/ui";

export const metadata = { title: "Stock Opname" };

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "Berlangsung",
  SUBMITTED: "Diserahkan",
  RECONCILED: "Terekonsiliasi",
  CANCELLED: "Dibatalkan",
};

export default async function OpnamePage() {
  const ctx = await requirePermission("tx.view");
  const canManage = roleHas(ctx.role, "opname.manage");
  const counts = await listStockCounts(ctx.org.id);
  const warehouses = canManage
    ? await prisma.warehouse.findMany({
        where: { organizationId: ctx.org.id, isActive: true },
        include: { locations: { where: { isActive: true }, orderBy: { code: "asc" } } },
        orderBy: { code: "asc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Opname"
        description="Penghitungan fisik dengan baseline yang dapat ditelusuri; selisih diposting sebagai transaksi penyesuaian."
        actions={canManage ? <OpnameCreateForm warehouses={warehouses} /> : null}
      />
      <Card>
        {counts.length === 0 ? (
          <EmptyState title="Belum ada stock count" description="Mulai opname untuk gudang atau lokasi tertentu." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Nomor</Th>
                <Th>Gudang / Lokasi</Th>
                <Th className="text-center">Baris</Th>
                <Th>Dimulai</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/opname/${c.id}`} className="font-medium text-indigo-600 hover:underline">
                      {c.number}
                    </Link>
                  </Td>
                  <Td className="text-xs">
                    {c.warehouse.code}
                    {c.locationId ? " (semua lokasi)" : " (seluruh gudang)"}
                  </Td>
                  <Td className="text-center tabular-nums">{c.lines.length}</Td>
                  <Td className="text-xs text-slate-500">
                    {new Date(c.startedAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                  </Td>
                  <Td><Badge tone={statusTone(c.status)}>{STATUS_LABELS[c.status] ?? c.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
