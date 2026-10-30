import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { listBOMs } from "@/lib/services/production";
import { BOMCreateForm, BOMArchiveButton } from "@/components/production-forms";
import { Card, PageHeader, Badge, TableWrap, Th, Td, EmptyState, statusTone } from "@/components/ui";
import { formatQty } from "@/lib/decimal";

export const metadata = { title: "Bill of Materials" };

export default async function BomPage() {
  const ctx = await requirePermission("bom.view");
  const canManage = roleHas(ctx.role, "bom.manage");
  const boms = await listBOMs(ctx.org.id);
  const items = canManage
    ? await prisma.item.findMany({
        where: { organizationId: ctx.org.id, isActive: true, type: { in: ["FINISHED_GOODS", "WIP", "RAW_MATERIAL", "CONSUMABLE", "RESALE"] } },
        include: { baseUom: true },
        orderBy: { code: "asc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bill of Materials"
        description="Resep produksi per produk. Satu produk dapat punya beberapa versi BOM; versi terpakai dalam histori tidak berubah."
        actions={
          canManage ? (
            <BOMCreateForm
              items={items.map((i) => ({
                id: i.id, code: i.code, name: i.name,
                uomId: i.baseUomId, uomCode: i.baseUom.code, avgCost: i.avgCost,
              }))}
            />
          ) : null
        }
      />
      {boms.length === 0 ? (
        <Card>
          <EmptyState title="Belum ada BOM" description="Buat BOM untuk mulai mencatat work order produksi." />
        </Card>
      ) : (
        boms.map((bom) => (
          <Card key={bom.id}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-slate-800">{bom.code} — v{bom.version}</h2>
                <Badge tone={statusTone(bom.status)}>{bom.status}</Badge>
              </div>
              {canManage && bom.status === "ACTIVE" ? <BOMArchiveButton bomId={bom.id} /> : null}
            </div>
            <div className="px-5 py-3 text-sm text-slate-600">
              Produksi <strong>{bom.item.code} — {bom.item.name}</strong> sebanyak{" "}
              <strong>{formatQty(bom.outputQty)} {bom.item.baseUom.code}</strong> membutuhkan:
            </div>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Komponen</Th>
                  <Th className="text-right">Qty per Output</Th>
                  <Th className="text-right">Scrap %</Th>
                </tr>
              </thead>
              <tbody>
                {bom.components.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="font-medium">{c.componentItem.code}</span>
                      <span className="ml-2 text-xs text-slate-500">{c.componentItem.name}</span>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatQty(c.quantity)} {c.componentItem.baseUom.code}
                    </Td>
                    <Td className="text-right tabular-nums">{Number(c.scrapPercent)}%</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>
        ))
      )}
    </div>
  );
}
