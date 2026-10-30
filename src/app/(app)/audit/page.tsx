import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, PageHeader, TableWrap, Th, Td, EmptyState, Badge } from "@/components/ui";

export const metadata = { title: "Audit Trail" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const ctx = await requirePermission("audit.view");
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const pageSize = 50;

  const where = {
    organizationId: ctx.org.id,
    ...(sp.q ? { action: { contains: sp.q.toUpperCase() } } : {}),
  };
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Jejak aktivitas penting: login, master data, transaksi, approval, reversal, hingga perubahan langganan."
        actions={
          <a href="/api/reports/export?type=audit" className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Export CSV
          </a>
        }
      />

      <Card className="p-4">
        <form method="get" className="flex gap-3">
          <input
            name="q" defaultValue={sp.q ?? ""} placeholder="Cari aksi (mis. TX_POST, ITEM_CREATE)…"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">Filter</button>
        </form>
      </Card>

      <Card>
        {logs.length === 0 ? (
          <EmptyState title="Belum ada aktivitas tercatat" />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Waktu</Th>
                <Th>Pengguna</Th>
                <Th>Aksi</Th>
                <Th>Entity</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 align-top">
                  <Td className="whitespace-nowrap text-xs text-slate-500">
                    {l.createdAt.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </Td>
                  <Td className="text-xs">
                    {l.user ? (
                      <>
                        <p className="font-medium text-slate-700">{l.user.name}</p>
                        <p className="text-slate-400">{l.user.email}</p>
                      </>
                    ) : "sistem"}
                  </Td>
                  <Td><Badge tone="indigo">{l.action}</Badge></Td>
                  <Td className="text-xs">
                    {l.entityType}
                    {l.entityId ? <span className="block text-slate-400">{l.entityId.slice(0, 14)}…</span> : null}
                  </Td>
                  <Td className="max-w-md text-xs text-slate-500">
                    {l.after ? <span className="block truncate">{l.after}</span> : null}
                    {l.reason ? <span className="block text-slate-400">alasan: {l.reason}</span> : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between px-5 py-3 text-xs text-slate-500">
            <span>Halaman {page} dari {totalPages}</span>
            <div className="flex gap-2">
              {page > 1 ? <a href={`/audit?q=${sp.q ?? ""}&page=${page - 1}`} className="rounded-md bg-white px-2.5 py-1 ring-1 ring-slate-200 hover:bg-slate-50">Sebelumnya</a> : null}
              {page < totalPages ? <a href={`/audit?q=${sp.q ?? ""}&page=${page + 1}`} className="rounded-md bg-white px-2.5 py-1 ring-1 ring-slate-200 hover:bg-slate-50">Berikutnya</a> : null}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
