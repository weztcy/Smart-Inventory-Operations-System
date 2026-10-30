import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { PartnerCreateForm, ActiveToggle } from "@/components/master-forms";
import { Card, PageHeader, Badge, TableWrap, Th, Td, EmptyState } from "@/components/ui";

export const metadata = { title: "Supplier" };

export default async function SuppliersPage() {
  const ctx = await requirePermission("po.view");
  const canManage = roleHas(ctx.role, "master.manage");
  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: ctx.org.id },
    include: { _count: { select: { purchaseOrders: true } } },
    orderBy: { code: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier"
        description="Mitra pemasok untuk purchase order dan penerimaan barang."
        actions={canManage ? <PartnerCreateForm kind="supplier" /> : null}
      />
      <Card>
        {suppliers.length === 0 ? (
          <EmptyState title="Belum ada supplier" />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Kode</Th>
                <Th>Nama</Th>
                <Th>Kontak</Th>
                <Th className="text-center">Jumlah PO</Th>
                <Th>Status</Th>
                {canManage ? <Th className="text-right">Aksi</Th> : null}
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td className="font-medium">{s.code}</Td>
                  <Td>{s.name}</Td>
                  <Td className="text-xs text-slate-500">
                    {s.contactPerson ?? "—"}{s.phone ? ` • ${s.phone}` : ""}
                  </Td>
                  <Td className="text-center tabular-nums">{s._count.purchaseOrders}</Td>
                  <Td>{s.isActive ? <Badge tone="green">aktif</Badge> : <Badge tone="gray">nonaktif</Badge>}</Td>
                  {canManage ? (
                    <Td className="text-right">
                      <ActiveToggle path={`/api/suppliers/${s.id}`} isActive={s.isActive} />
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
