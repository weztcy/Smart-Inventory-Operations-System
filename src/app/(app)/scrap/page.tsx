import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { listScrapRecords, getScrapMetrics } from "@/lib/services/scrap";
import { ScrapCreateForm, ClassifyForm, DisposeForm } from "@/components/scrap-forms";
import { Card, PageHeader, Badge, TableWrap, Th, Td, EmptyState, StatCard, statusTone } from "@/components/ui";
import { SCRAP_CATEGORIES, SCRAP_CATEGORY_LABELS, type ScrapCategory } from "@/lib/constants";
import { formatCurrency, formatQty, toDec } from "@/lib/decimal";

export const metadata = { title: "Scrap & Material Sisa" };

export default async function ScrapPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string }>;
}) {
  const ctx = await requirePermission("scrap.view");
  const sp = await searchParams;
  const canManage = roleHas(ctx.role, "scrap.manage");

  const [records, metrics] = await Promise.all([
    listScrapRecords(ctx.org.id, { category: sp.category, status: sp.status }),
    getScrapMetrics(ctx.org.id),
  ]);

  const [sourceItems, scrapItems, locations, mos] = canManage
    ? await Promise.all([
        prisma.item.findMany({
          where: { organizationId: ctx.org.id, isActive: true, type: { in: ["RAW_MATERIAL", "CONSUMABLE", "WIP"] } },
          include: { baseUom: true },
          orderBy: { code: "asc" },
        }),
        prisma.item.findMany({
          where: { organizationId: ctx.org.id, isActive: true, type: "SCRAP" },
          include: { baseUom: true },
          orderBy: { code: "asc" },
        }),
        prisma.storageLocation.findMany({
          where: { organizationId: ctx.org.id, isActive: true },
          include: { warehouse: true },
          orderBy: { code: "asc" },
        }),
        prisma.productionOrder.findMany({
          where: { organizationId: ctx.org.id, status: { in: ["CONFIRMED", "IN_PROGRESS", "COMPLETED"] } },
          include: { item: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ])
    : [[], [], [], []];

  const locOpts = locations.map((l) => ({ id: l.id, code: l.code, name: l.name, warehouseCode: l.warehouse.code }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scrap & Material Sisa"
        description="Material sisa dicatat sebagai stok terlacak, diklasifikasikan, lalu dipakai ulang, dijual, atau dibuang."
        actions={
          canManage ? (
            <ScrapCreateForm
              sourceItems={sourceItems.map((i) => ({
                id: i.id, code: i.code, name: i.name,
                uomId: i.baseUomId, uomCode: i.baseUom.code, avgCost: i.avgCost,
              }))}
              scrapItems={scrapItems.map((i) => ({
                id: i.id, code: i.code, name: i.name,
                uomId: i.baseUomId, uomCode: i.baseUom.code, avgCost: i.avgCost,
              }))}
              locations={locOpts}
              mos={mos.map((m) => ({ id: m.id, number: m.number, label: `${m.number} — ${m.item.code}` }))}
            />
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Catatan Scrap" value={records.length} hint="berstatus posted/disposed" />
        <StatCard label="Reusable" value={metrics.byCategory.REUSABLE?.count ?? 0} tone="success" />
        <StatCard label="Pending Assessment" value={metrics.byCategory.PENDING?.count ?? 0} tone="warning" />
        <StatCard
          label="Estimasi Nilai Tertahan"
          value={formatCurrency(
            (metrics.byCategory.REUSABLE?.value ?? toDec(0)).plus(metrics.byCategory.SALEABLE?.value ?? toDec(0)),
            ctx.org.currency,
          )}
          hint="estimasi — bukan pendapatan"
        />
      </div>

      {canManage && scrapItems.length === 0 ? (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Belum ada item bertipe <strong>SCRAP</strong>. Buat dulu di master item (mis.
          SCRAP-PLAT-BESI) agar material sisa dapat disimpan sebagai stok terlacak.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <Link href="/scrap" className={!sp.category ? "rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white" : "rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}>
          Semua
        </Link>
        {SCRAP_CATEGORIES.map((c) => (
          <Link
            key={c}
            href={`/scrap?category=${c}`}
            className={sp.category === c ? "rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white" : "rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}
          >
            {SCRAP_CATEGORY_LABELS[c]}
          </Link>
        ))}
      </div>

      <Card>
        {records.length === 0 ? (
          <EmptyState
            title="Belum ada catatan scrap"
            description="Scrap dicatat setelah konsumsi material produksi — lihat modul Work Order."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Nomor</Th>
                <Th>Tanggal</Th>
                <Th>MO</Th>
                <Th>Material → Item Scrap</Th>
                <Th className="text-right">Qty</Th>
                <Th>Kategori</Th>
                <Th>Status</Th>
                {canManage ? <Th className="text-right">Aksi</Th> : null}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td className="font-medium">{r.number}</Td>
                  <Td className="text-xs text-slate-500">
                    {new Date(r.scrapDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                  </Td>
                  <Td className="text-xs">
                    {r.productionOrder ? (
                      <Link href={`/produksi/orders/${r.productionOrder.id}`} className="text-indigo-600 hover:underline">
                        {r.productionOrder.number}
                      </Link>
                    ) : "—"}
                  </Td>
                  <Td className="text-xs">
                    <span className="font-medium text-slate-700">{r.sourceItem.code}</span>
                    {" → "}
                    <span className="font-medium text-purple-700">{r.scrapItem.code}</span>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatQty(r.scrapQty)} {r.scrapItem.baseUom.code}
                  </Td>
                  <Td>{canManage && r.status === "POSTED" ? (
                    <ClassifyForm scrapId={r.id} current={r.category} />
                  ) : (
                    <Badge tone={r.category === "REUSABLE" ? "green" : r.category === "DISPOSAL" ? "red" : r.category === "SALEABLE" ? "blue" : "yellow"}>
                      {r.category}
                    </Badge>
                  )}</Td>
                  <Td><Badge tone={statusTone(r.status)}>{r.status}</Badge></Td>
                  {canManage ? (
                    <Td className="text-right">
                      {r.status === "POSTED" ? (
                        <DisposeForm
                          scrapRecordId={r.id}
                          itemId={r.scrapItemId}
                          itemCode={r.scrapItem.code}
                          maxQty={r.scrapQty}
                          uomCode={r.scrapItem.baseUom.code}
                          locations={locOpts}
                        />
                      ) : r.status === "DISPOSED" ? (
                        <span className="text-xs text-slate-400">selesai</span>
                      ) : null}
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
