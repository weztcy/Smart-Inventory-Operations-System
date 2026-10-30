import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { getProductionOrderDetail } from "@/lib/services/production";
import { MOActionButton, ConsumeForm, OutputForm } from "@/components/production-forms";
import { Card, CardHeader, PageHeader, Badge, TableWrap, Th, Td, statusTone } from "@/components/ui";
import { PRODUCTION_STATUS_LABELS, type ProductionStatus } from "@/lib/constants";
import { formatQty, toDec } from "@/lib/decimal";

export const metadata = { title: "Detail Work Order" };

export default async function MODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("production.view");
  const { id } = await params;
  const data = await getProductionOrderDetail(ctx.org.id, id);
  if (!data) notFound();
  const { mo, variance, totalOutput, outputVariance } = data;

  const canManage = roleHas(ctx.role, "production.manage") && ctx.org.status === "ACTIVE";
  const inProgress = ["CONFIRMED", "IN_PROGRESS"].includes(mo.status);

  const [locations, scrapItems] = inProgress || mo.status === "COMPLETED"
    ? await Promise.all([
        prisma.storageLocation.findMany({
          where: { organizationId: ctx.org.id, isActive: true },
          include: { warehouse: true },
          orderBy: { code: "asc" },
        }),
        prisma.item.findMany({
          where: { organizationId: ctx.org.id, isActive: true, type: "SCRAP" },
          orderBy: { code: "asc" },
        }),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`MO ${mo.number} — ${mo.item.code}`}
        description={`${mo.item.name} • BOM ${mo.bom.code} v${mo.bom.version} • Rencana ${formatQty(mo.plannedQty)} ${mo.item.baseUom.code}`}
        actions={
          <>
            <Link href="/produksi/orders" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              ← Kembali
            </Link>
            {mo.status === "DRAFT" && canManage ? (
              <MOActionButton moId={mo.id} action="confirm" label="Konfirmasi (Reservasi Material)" />
            ) : null}
            {mo.status === "CONFIRMED" && canManage ? (
              <MOActionButton moId={mo.id} action="start" label="Mulai Produksi" />
            ) : null}
            {inProgress && canManage ? (
              <>
                <ConsumeForm
                  moId={mo.id}
                  components={variance.map((v) => ({
                    itemId: v.component.id,
                    code: v.component.code,
                    name: v.component.name,
                    uomCode: v.component.baseUom.code,
                    planned: v.planned.toString(),
                  }))}
                  locations={locations.map((l) => ({ id: l.id, code: l.code, name: l.name, warehouseCode: l.warehouse.code }))}
                />
                <OutputForm
                  moId={mo.id}
                  productCode={mo.item.code}
                  productName={mo.item.name}
                  plannedQty={mo.plannedQty}
                  locations={locations.map((l) => ({ id: l.id, code: l.code, name: l.name, warehouseCode: l.warehouse.code }))}
                />
                <MOActionButton
                  moId={mo.id} action="complete" label="Selesaikan" variant="success"
                  confirmText="Selesaikan MO? Pastikan hasil produksi dan konsumsi telah dicatat."
                  body={{ confirmNoMoreConsumption: mo.consumptions.length === 0 }}
                />
                <MOActionButton
                  moId={mo.id} action="cancel" label="Batalkan" variant="danger"
                  confirmText="Batalkan MO? Seluruh reservasi material dilepas."
                />
              </>
            ) : null}
            {mo.status === "COMPLETED" && scrapItems.length > 0 ? (
              <Link href="/scrap" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Catat Scrap →
              </Link>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={statusTone(mo.status)}>
          {PRODUCTION_STATUS_LABELS[mo.status as ProductionStatus] ?? mo.status}
        </Badge>
        {mo.startedAt ? (
          <span className="text-xs text-slate-500">Mulai {new Date(mo.startedAt).toLocaleDateString("id-ID")}</span>
        ) : null}
        {mo.completedAt ? (
          <span className="text-xs text-slate-500">Selesai {new Date(mo.completedAt).toLocaleDateString("id-ID")}</span>
        ) : null}
        {mo.assignedTo ? <span className="text-xs text-slate-500">PJ: {mo.assignedTo}</span> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Output</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {formatQty(totalOutput)} <span className="text-sm font-normal text-slate-400">/ {formatQty(mo.plannedQty)} {mo.item.baseUom.code}</span>
          </p>
          <p className={`mt-1 text-xs font-medium ${outputVariance.lt(0) ? "text-red-600" : "text-emerald-600"}`}>
            Variance output: {formatQty(outputVariance)}
          </p>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <p className="text-xs font-medium uppercase text-slate-500">Konsumsi vs Rencana</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {variance.map((v) => (
              <li key={v.component.id} className="flex items-center justify-between">
                <span className="text-slate-700">
                  <span className="font-medium">{v.component.code}</span>{" "}
                  <span className="text-xs text-slate-400">({v.component.baseUom.code})</span>
                </span>
                <span className="tabular-nums">
                  <span className="text-slate-500">{formatQty(v.actual)}</span>
                  <span className="text-slate-400"> / {formatQty(v.planned)}</span>
                  <span className={`ml-2 font-medium ${v.varianceQty.gt(0) ? "text-red-600" : "text-emerald-600"}`}>
                    {v.varianceQty.eq(0) ? "=" : v.varianceQty.gt(0) ? "+" : ""}
                    {formatQty(v.varianceQty)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Riwayat Konsumsi Material" />
        {mo.consumptions.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-500">
            Belum ada konsumsi tercatat. Sistem tidak mengasumsikan konsumsi otomatis dari BOM.
          </p>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Waktu</Th>
                <Th>Item</Th>
                <Th className="text-right">Rencana</Th>
                <Th className="text-right">Aktual</Th>
                <Th className="text-right">Variance</Th>
              </tr>
            </thead>
            <tbody>
              {mo.consumptions.map((c) => {
                const planned = toDec(c.plannedQty);
                const actual = toDec(c.actualQty);
                const v = actual.minus(planned);
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td className="text-xs text-slate-500">
                      {new Date(c.consumedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </Td>
                    <Td>
                      <span className="font-medium">{c.item.code}</span>
                      <span className="ml-1.5 text-xs text-slate-500">{c.item.name}</span>
                    </Td>
                    <Td className="text-right tabular-nums text-slate-500">{formatQty(planned)}</Td>
                    <Td className="text-right font-medium tabular-nums">{formatQty(actual)}</Td>
                    <Td className={`text-right tabular-nums ${v.gt(0) ? "text-red-600" : "text-emerald-600"}`}>
                      {v.gt(0) ? "+" : ""}{formatQty(v)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {mo.notes ? (
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Catatan</p>
          <p className="mt-1.5 text-sm text-slate-700">{mo.notes}</p>
        </Card>
      ) : null}
    </div>
  );
}
