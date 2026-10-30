import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { PartnerCreateForm, ActiveToggle } from "@/components/master-forms";
import { Card, PageHeader, Badge, TableWrap, Th, Td, EmptyState } from "@/components/ui";

export const metadata = { title: "Customer" };

export default async function CustomersPage() {
  const ctx = await requirePermission("item.view");
  const canManage = roleHas(ctx.role, "master.manage");
  const customers = await prisma.customer.findMany({
    where: { organizationId: ctx.org.id },
    orderBy: { code: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer"
        description="Master penerima barang untuk pengeluaran jenis pengiriman."
        actions={canManage ? <PartnerCreateForm kind="customer" /> : null}
      />
      <Card>
        {customers.length === 0 ? (
          <EmptyState title="Belum ada customer" />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Kode</Th>
                <Th>Nama</Th>
                <Th>Kontak</Th>
                <Th>Status</Th>
                {canManage ? <Th className="text-right">Aksi</Th> : null}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td className="font-medium">{c.code}</Td>
                  <Td>{c.name}</Td>
                  <Td className="text-xs text-slate-500">
                    {c.contactPerson ?? "—"}{c.phone ? ` • ${c.phone}` : ""}
                  </Td>
                  <Td>{c.isActive ? <Badge tone="green">aktif</Badge> : <Badge tone="gray">nonaktif</Badge>}</Td>
                  {canManage ? (
                    <Td className="text-right">
                      <ActiveToggle path={`/api/customers/${c.id}`} isActive={c.isActive} />
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
