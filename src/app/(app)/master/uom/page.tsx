import { requirePermission } from "@/lib/auth";
import { roleHas } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { UomCreateForm, ConversionCreateForm } from "@/components/master-forms";
import { Card, PageHeader, TableWrap, Th, Td, EmptyState, Badge } from "@/components/ui";

export const metadata = { title: "Satuan" };

export default async function UomPage() {
  const ctx = await requirePermission("item.view");
  const canManage = roleHas(ctx.role, "master.manage");
  const uoms = await prisma.unitOfMeasure.findMany({
    where: { organizationId: ctx.org.id },
    include: {
      conversionsFrom: { include: { toUom: true } },
      conversionsTo: { include: { fromUom: true } },
    },
    orderBy: { code: "asc" },
  });
  const allConversions = uoms.flatMap((u) => [
    ...u.conversionsFrom.map((c) => ({ id: c.id, from: u.code, to: c.toUom.code, factor: c.factor })),
    ...u.conversionsTo.map((c) => ({ id: `${c.id}-dup`, from: c.fromUom.code, to: u.code, factor: c.factor })),
  ]);
  const seen = new Set<string>();
  const conversions = allConversions.filter((c) => {
    const key = `${c.from}->${c.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Satuan & Konversi"
        description="Semua kuantitas transaksi dikonversi ke satuan dasar item. Konversi harus eksplisit — tanpa perkiraan."
        actions={
          canManage ? (
            <>
              <ConversionCreateForm uoms={uoms} />
              <UomCreateForm />
            </>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-800">Daftar Satuan</div>
          {uoms.length === 0 ? (
            <EmptyState title="Belum ada satuan" />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Kode</Th>
                  <Th>Nama</Th>
                </tr>
              </thead>
              <tbody>
                {uoms.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <Td className="font-medium">{u.code}</Td>
                    <Td className="text-sm">{u.name}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <div className="border-b border-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-800">Konversi Terdaftar</div>
          {conversions.length === 0 ? (
            <EmptyState title="Belum ada konversi" description="Standar kg→g, m→cm, l→ml dibuat otomatis saat registrasi." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Dari</Th>
                  <Th>Ke</Th>
                  <Th className="text-right">Faktor</Th>
                </tr>
              </thead>
              <tbody>
                {conversions.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td><Badge tone="blue">{c.from}</Badge></Td>
                    <Td><Badge tone="blue">{c.to}</Badge></Td>
                    <Td className="text-right tabular-nums">1 {c.from} = {Number(c.factor)} {c.to}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </div>
  );
}
