import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { WarehouseCreateForm, LocationCreateForm, ActiveToggle } from "@/components/master-forms";
import { Card, PageHeader, Badge, TableWrap, Th, Td, EmptyState } from "@/components/ui";
import { LOCATION_TYPE_LABELS, type LocationType } from "@/lib/constants";

export const metadata = { title: "Gudang & Lokasi" };

export default async function WarehousesPage() {
  const ctx = await requirePermission("item.view");
  const canManage = roleHas(ctx.role, "master.manage");
  const warehouses = await prisma.warehouse.findMany({
    where: { organizationId: ctx.org.id },
    include: { locations: { orderBy: { code: "asc" } } },
    orderBy: { code: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gudang & Lokasi Penyimpanan"
        description="Stok dibedakan per kombinasi item dan lokasi. Gudang bergejala historis tidak dapat dihapus permanen."
        actions={
          canManage ? (
            <>
              <LocationCreateForm warehouses={warehouses} />
              <WarehouseCreateForm />
            </>
          ) : null
        }
      />

      {warehouses.length === 0 ? (
        <Card>
          <EmptyState title="Belum ada gudang" description="Gudang WH-01 dibuat otomatis saat registrasi organisasi." />
        </Card>
      ) : (
        warehouses.map((w) => (
          <Card key={w.id}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">
                  {w.code} — {w.name}{" "}
                  {w.isActive ? <Badge tone="green">aktif</Badge> : <Badge tone="gray">nonaktif</Badge>}
                </h2>
                {w.address ? <p className="mt-0.5 text-xs text-slate-500">{w.address}{w.manager ? ` • PJ: ${w.manager}` : ""}</p> : null}
              </div>
              {canManage ? (
                <ActiveToggle
                  path={`/api/warehouses/${w.id}`}
                  isActive={w.isActive}
                  confirmText="Nonaktifkan gudang? Hanya boleh bila tidak memiliki stok."
                />
              ) : null}
            </div>
            {w.locations.length === 0 ? (
              <EmptyState title="Belum ada lokasi" description="Tambahkan lokasi seperti RAW, CUTTING, FINISHED, atau SCRAP." />
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Kode</Th>
                    <Th>Nama</Th>
                    <Th>Tipe</Th>
                    <Th>Status</Th>
                    {canManage ? <Th className="text-right">Aksi</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {w.locations.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <Td className="font-medium">{l.code}</Td>
                      <Td>{l.name}</Td>
                      <Td className="text-xs">{LOCATION_TYPE_LABELS[l.type as LocationType] ?? l.type}</Td>
                      <Td>{l.isActive ? <Badge tone="green">aktif</Badge> : <Badge tone="gray">nonaktif</Badge>}</Td>
                      {canManage ? (
                        <Td className="text-right">
                          <ActiveToggle path={`/api/locations/${l.id}`} isActive={l.isActive} />
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
