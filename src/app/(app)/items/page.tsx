import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { listItems } from "@/lib/services/items";
import { prisma } from "@/lib/db";
import { ItemFormButton, ItemToggleActive } from "@/components/master-forms";
import { Card, PageHeader, Badge, TableWrap, Th, Td, EmptyState } from "@/components/ui";
import { formatCurrency, formatQty } from "@/lib/decimal";
import { ITEM_TYPES, ITEM_TYPE_LABELS, type ItemType } from "@/lib/constants";

export const metadata = { title: "Item" };

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; active?: string }>;
}) {
  const ctx = await requirePermission("item.view");
  const sp = await searchParams;
  const canManage = roleHas(ctx.role, "item.manage");

  const [items, categories, uoms] = await Promise.all([
    listItems(ctx.org.id, sp),
    prisma.itemCategory.findMany({ where: { organizationId: ctx.org.id }, orderBy: { name: "asc" } }),
    prisma.unitOfMeasure.findMany({ where: { organizationId: ctx.org.id }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Item"
        description="SKU unik per organisasi. Item yang telah bertransaksi tidak dapat dihapus — nonaktifkan sebagai gantinya."
        actions={canManage ? <ItemFormButton categories={categories} uoms={uoms} /> : null}
      />

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-center gap-3">
          <input
            name="q" defaultValue={sp.q ?? ""} placeholder="Cari SKU / nama…"
            className="min-w-52 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select name="type" defaultValue={sp.type ?? ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Semua tipe</option>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <select name="active" defaultValue={sp.active ?? ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Semua status</option>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
          <button className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">Filter</button>
        </form>
      </Card>

      <Card>
        {items.length === 0 ? (
          <EmptyState
            title="Belum ada item"
            description="Tambahkan item pertama atau impor dari CSV di menu Import CSV."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Nama</Th>
                <Th>Tipe</Th>
                <Th>Satuan</Th>
                <Th>Kategori</Th>
                <Th className="text-right">Min Stock</Th>
                <Th className="text-right">Avg Cost</Th>
                <Th>Status</Th>
                {canManage ? <Th className="text-right">Aksi</Th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/stok/${i.id}`} className="font-medium text-slate-800 hover:text-indigo-600">{i.code}</Link>
                  </Td>
                  <Td>{i.name}</Td>
                  <Td className="text-xs">{ITEM_TYPE_LABELS[i.type as ItemType] ?? i.type}</Td>
                  <Td className="text-xs">{i.baseUom.code}</Td>
                  <Td className="text-xs">{i.category?.name ?? "—"}</Td>
                  <Td className="text-right tabular-nums">
                    {i.minStock ? formatQty(i.minStock) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums text-slate-500">
                    {Number(i.avgCost) > 0 ? formatCurrency(i.avgCost, ctx.org.currency) : "—"}
                  </Td>
                  <Td>
                    {i.isActive ? <Badge tone="green">aktif</Badge> : <Badge tone="gray">nonaktif</Badge>}
                  </Td>
                  {canManage ? (
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <ItemFormButton
                          categories={categories}
                          uoms={uoms}
                          edit={{
                            id: i.id, code: i.code, name: i.name, type: i.type,
                            baseUomId: i.baseUomId, categoryId: i.categoryId,
                            description: i.description, barcode: i.barcode,
                            minStock: i.minStock, reorderQty: i.reorderQty,
                            defaultCost: i.defaultCost, notes: i.notes,
                          }}
                        />
                        <ItemToggleActive itemId={i.id} isActive={i.isActive} />
                      </div>
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
