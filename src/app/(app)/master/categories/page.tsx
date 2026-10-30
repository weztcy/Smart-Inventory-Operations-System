import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { CategoryCreateForm, CategoryDeleteButton } from "@/components/master-forms";
import { Card, PageHeader, TableWrap, Th, Td, EmptyState } from "@/components/ui";

export const metadata = { title: "Kategori" };

export default async function CategoriesPage() {
  const ctx = await requirePermission("item.view");
  const canManage = roleHas(ctx.role, "master.manage");
  const categories = await prisma.itemCategory.findMany({
    where: { organizationId: ctx.org.id },
    include: { _count: { select: { items: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kategori Item"
        description="Kelompokkan item untuk pencarian, filter, dan laporan. Kategori terpakai tidak dapat dihapus."
        actions={canManage ? <CategoryCreateForm /> : null}
      />
      <Card>
        {categories.length === 0 ? (
          <EmptyState title="Belum ada kategori" description="Contoh: Steel, Aluminum, Electronic Components, Reusable Scrap." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Nama</Th>
                <Th>Deskripsi</Th>
                <Th className="text-center">Jumlah Item</Th>
                {canManage ? <Th className="text-right">Aksi</Th> : null}
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td className="font-medium">{c.name}</Td>
                  <Td className="text-xs text-slate-500">{c.description ?? "—"}</Td>
                  <Td className="text-center tabular-nums">{c._count.items}</Td>
                  {canManage ? (
                    <Td className="text-right">
                      <CategoryDeleteButton id={c.id} />
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
