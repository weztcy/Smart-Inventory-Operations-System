import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listMembers, listInvitations } from "@/lib/services/org";
import {
  OrgSettingsForm, InviteForm, MemberRoleSelect, MemberActiveToggle,
  RevokeInviteButton, PlanSelector,
} from "@/components/settings-forms";
import { Card, CardHeader, PageHeader, Badge, TableWrap, Th, Td, statusTone } from "@/components/ui";
import { ROLE_LABELS, type Role } from "@/lib/constants";

export const metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  const ctx = await requirePermission("settings.manage");

  const [org, members, invitations, plans, sub] = await Promise.all([
    prisma.organization.findUnique({ where: { id: ctx.org.id } }),
    listMembers(ctx.org.id),
    listInvitations(ctx.org.id),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.subscription.findUnique({
      where: { organizationId: ctx.org.id },
      include: { plan: true },
    }),
  ]);
  if (!org) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengaturan Organisasi"
        description="Profil perusahaan, pengguna & izin akses, serta paket langganan."
      />

      <Card>
        <CardHeader title="Profil Organisasi" />
        <OrgSettingsForm
          org={{
            name: org.name, businessType: org.businessType, country: org.country,
            currency: org.currency, timezone: org.timezone,
            contactEmail: org.contactEmail, phone: org.phone, address: org.address,
          }}
        />
      </Card>

      <Card>
        <CardHeader title={`Anggota (${members.filter((m) => m.isActive).length} aktif)`} />
        <TableWrap>
          <thead>
            <tr>
              <Th>Nama</Th>
              <Th>Email</Th>
              <Th>Peran</Th>
              <Th>Status</Th>
              <Th className="text-right">Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <Td className="font-medium">{m.user.name}</Td>
                <Td className="text-xs text-slate-500">{m.user.email}</Td>
                <Td>
                  {m.role === "OWNER" ? (
                    <Badge tone="indigo">{ROLE_LABELS.OWNER}</Badge>
                  ) : (
                    <MemberRoleSelect membershipId={m.id} current={m.role} />
                  )}
                </Td>
                <Td>{m.isActive ? <Badge tone="green">aktif</Badge> : <Badge tone="gray">nonaktif</Badge>}</Td>
                <Td className="text-right">
                  {m.role !== "OWNER" ? (
                    <MemberActiveToggle membershipId={m.id} isActive={m.isActive} />
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <div className="border-t border-slate-100">
          <InviteForm />
        </div>
      </Card>

      {invitations.length > 0 ? (
        <Card>
          <CardHeader title={`Undangan Menunggu (${invitations.length})`} />
          <TableWrap>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Peran</Th>
                <Th>Kedaluwarsa</Th>
                <Th className="text-right">Aksi</Th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <Td className="text-sm">{inv.email}</Td>
                  <Td><Badge tone="blue">{ROLE_LABELS[inv.role as Role] ?? inv.role}</Badge></Td>
                  <Td className="text-xs text-slate-500">
                    {new Date(inv.expiresAt).toLocaleDateString("id-ID")}
                  </Td>
                  <Td className="text-right">
                    <RevokeInviteButton invitationId={inv.id} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
            Tautan klaim tersedia pada notifikasi setelah membuat undangan (pengiriman email
            memerlukan SMTP yang belum dikonfigurasi — lihat README).
          </p>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Langganan"
          actions={sub ? <Badge tone={statusTone(sub.status)}>{sub.status}</Badge> : null}
        />
        <PlanSelector currentPlan={sub?.plan.code ?? null} plans={plans} />
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
          Perubahan paket bersifat manual oleh owner — payment gateway belum terintegrasi dan tidak
          ada klaim pembayaran otomatis. Batas paket divalidasi backend saat menambah item,
          pengguna, dan gudang.
        </p>
      </Card>
    </div>
  );
}
