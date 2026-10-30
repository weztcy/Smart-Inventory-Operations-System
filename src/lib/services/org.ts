// Layanan organisasi: registrasi, keanggotaan, undangan, pengaturan, langganan (PRD §5, §19).
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import {
  ROLES, DEFAULT_UOMS, DEFAULT_UOM_CONVERSIONS, DEFAULT_PLANS,
  type Role,
} from "@/lib/constants";

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  orgName: string;
  businessType?: string;
  country?: string;
  currency?: string;
  timezone?: string;
}

/** Buat user + organisasi + owner + langganan Free + satuan default
 *  dalam satu transaksi konsisten (PRD §5.1). */
export async function registerOrganization(input: RegisterInput) {
  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict("Email sudah terdaftar. Silakan login atau gunakan email lain.");

  return prisma.$transaction(async (tx) => {
    const freePlan =
      (await tx.plan.findUnique({ where: { code: "FREE" } })) ??
      (await tx.plan.create({ data: DEFAULT_PLANS[0] }));

    const user = await tx.user.create({
      data: { email, name: input.name.trim(), passwordHash: await hashPassword(input.password) },
    });

    const org = await tx.organization.create({
      data: {
        name: input.orgName.trim(),
        businessType: input.businessType?.trim() || null,
        country: input.country || "ID",
        currency: input.currency || "IDR",
        timezone: input.timezone || "Asia/Jakarta",
        contactEmail: email,
      },
    });

    await tx.membership.create({
      data: { userId: user.id, organizationId: org.id, role: "OWNER" },
    });

    await tx.subscription.create({
      data: {
        organizationId: org.id,
        planId: freePlan.id,
        status: "ACTIVE",
        currentPeriodEnd: null,
      },
    });

    // Satuan default + konversi standar (PRD §6.5)
    const uoms = await Promise.all(
      DEFAULT_UOMS.map((u) =>
        tx.unitOfMeasure.create({ data: { organizationId: org.id, code: u.code, name: u.name } }),
      ),
    );
    const byCode = new Map(uoms.map((u) => [u.code, u]));
    for (const c of DEFAULT_UOM_CONVERSIONS) {
      const from = byCode.get(c.from);
      const to = byCode.get(c.to);
      if (from && to) {
        await tx.uomConversion.create({
          data: { organizationId: org.id, fromUomId: from.id, toUomId: to.id, factor: c.factor },
        });
      }
    }

    // Warehouse + lokasi awal agar organisasi langsung dapat bertransaksi (Workflow A §20.1)
    const wh = await tx.warehouse.create({
      data: {
        organizationId: org.id,
        code: "WH-01",
        name: "Gudang Utama",
      },
    });
    await Promise.all(
      [
        { code: "WH-01-RAW", name: "Bahan Baku", type: "RAW" },
        { code: "WH-01-FIN", name: "Barang Jadi", type: "FINISHED" },
        { code: "WH-01-SCR", name: "Scrap Storage", type: "SCRAP" },
      ].map((l) =>
        tx.storageLocation.create({
          data: { organizationId: org.id, warehouseId: wh.id, code: l.code, name: l.name, type: l.type },
        }),
      ),
    );

    await logAudit(tx, {
      orgId: org.id,
      userId: user.id,
      action: "ORG_REGISTER",
      entityType: "Organization",
      entityId: org.id,
      after: { name: org.name, plan: "FREE" },
    });

    return { userId: user.id, orgId: org.id };
  });
}

export async function seedPlansIfMissing() {
  const count = await prisma.plan.count();
  if (count === 0) {
    await prisma.plan.createMany({ data: DEFAULT_PLANS });
  }
}

// ---------- Keanggotaan & undangan ----------

export async function listMembers(orgId: string) {
  return prisma.membership.findMany({
    where: { organizationId: orgId },
    include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function listInvitations(orgId: string) {
  return prisma.invitation.findMany({
    where: { organizationId: orgId, status: "PENDING", expiresAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

export async function inviteMember(
  ctx: { org: { id: string; maxUsers: number | null }; user: { id: string } },
  input: { email: string; role: string },
) {
  if (!ROLES.includes(input.role as Role) || input.role === "OWNER") {
    throw badRequest("Peran undangan tidak valid (OWNER tidak dapat diundang).");
  }
  const email = input.email.toLowerCase().trim();
  const existingUser = await prisma.user.findUnique({ where: { email } });

  // Enforcemen batas seat paket (PRD §19.2)
  if (ctx.org.maxUsers !== null) {
    const activeMembers = await prisma.membership.count({
      where: { organizationId: ctx.org.id, isActive: true },
    });
    const pendingInvites = await prisma.invitation.count({
      where: { organizationId: ctx.org.id, status: "PENDING", expiresAt: { gte: new Date() } },
    });
    if (activeMembers + pendingInvites + 1 > ctx.org.maxUsers) {
      throw forbidden(
        `Batas pengguna paket (${ctx.org.maxUsers}) telah tercapai. Upgrade paket untuk mengundang lebih banyak anggota.`,
      );
    }
  }

  if (existingUser) {
    const m = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: existingUser.id, organizationId: ctx.org.id } },
    });
    if (m) throw conflict("Pengguna tersebut sudah menjadi anggota organisasi ini.");
  }

  const token = randomBytes(24).toString("hex");
  const invitation = await prisma.invitation.create({
    data: {
      organizationId: ctx.org.id,
      email,
      role: input.role,
      token,
      invitedById: ctx.user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "MEMBER_INVITE", entityType: "Invitation", entityId: invitation.id,
    after: { email, role: input.role },
  });
  // Catatan: pengiriman email memerlukan SMTP eksternal (lihat README);
  // untuk development tautan klaim ditampilkan di UI pengaturan.
  return invitation;
}

export async function acceptInvitation(token: string, userId: string | null, newUser?: { name: string; password: string }) {
  const inv = await prisma.invitation.findUnique({ where: { token } });
  if (!inv || inv.status !== "PENDING") throw notFound("Undangan tidak ditemukan atau sudah tidak berlaku.");
  if (inv.expiresAt < new Date()) throw badRequest("Undangan sudah kedaluwarsa. Minta undangan baru.");

  return prisma.$transaction(async (tx) => {
    let uid = userId;
    if (!uid) {
      const email = inv.email.toLowerCase();
      const exists = await tx.user.findUnique({ where: { email } });
      if (exists) throw conflict("Email sudah terdaftar — login terlebih dahulu lalu klaim undangan.");
      if (!newUser?.name || !newUser?.password) {
        throw badRequest("Nama dan password diperlukan untuk membuat akun baru.");
      }
      const user = await tx.user.create({
        data: { email, name: newUser.name, passwordHash: await hashPassword(newUser.password) },
      });
      uid = user.id;
    }
    const existing = await tx.membership.findUnique({
      where: { userId_organizationId: { userId: uid, organizationId: inv.organizationId } },
    });
    if (existing) throw conflict("Anda sudah menjadi anggota organisasi ini.");
    await tx.membership.create({
      data: { userId: uid, organizationId: inv.organizationId, role: inv.role },
    });
    // Token tidak dapat dipakai ulang setelah diklaim (PRD §5.3)
    await tx.invitation.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    await logAudit(tx, {
      orgId: inv.organizationId, userId: uid,
      action: "MEMBER_JOIN", entityType: "Invitation", entityId: inv.id,
    });
    return { userId: uid, organizationId: inv.organizationId };
  });
}

export async function updateMemberRole(
  ctx: { org: { id: string }; user: { id: string } },
  membershipId: string,
  role: string,
) {
  if (!ROLES.includes(role as Role)) throw badRequest("Peran tidak valid.");
  const m = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId: ctx.org.id },
  });
  if (!m) throw notFound("Anggota tidak ditemukan.");
  if (m.role === "OWNER") throw forbidden("Peran owner tidak dapat diubah lewat aksi ini.");
  const updated = await prisma.membership.update({
    where: { id: m.id },
    data: { role },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "MEMBER_ROLE_UPDATE", entityType: "Membership", entityId: m.id,
    before: { role: m.role }, after: { role },
  });
  return updated;
}

export async function setMemberActive(
  ctx: { org: { id: string }; user: { id: string } },
  membershipId: string,
  isActive: boolean,
) {
  const m = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId: ctx.org.id },
  });
  if (!m) throw notFound("Anggota tidak ditemukan.");
  if (m.role === "OWNER") throw forbidden("Owner tidak dapat dinonaktifkan.");
  // Nonaktifkan keanggotaan, BUKAN menghapus histori transaksi (PRD §5.2)
  const updated = await prisma.membership.update({
    where: { id: m.id },
    data: { isActive },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: isActive ? "MEMBER_ACTIVATE" : "MEMBER_DEACTIVATE",
    entityType: "Membership", entityId: m.id,
  });
  return updated;
}

export async function revokeInvitation(ctx: { org: { id: string } }, invitationId: string) {
  const inv = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId: ctx.org.id },
  });
  if (!inv) throw notFound("Undangan tidak ditemukan.");
  if (inv.status !== "PENDING") throw badRequest("Hanya undangan berstatus PENDING yang dapat dibatalkan.");
  await prisma.invitation.update({ where: { id: inv.id }, data: { status: "REVOKED" } });
  await logAudit(prisma, {
    orgId: ctx.org.id, action: "INVITATION_REVOKE",
    entityType: "Invitation", entityId: inv.id,
  });
}

// ---------- Pengaturan organisasi ----------

export async function updateOrgSettings(
  ctx: { org: { id: string }; user: { id: string } },
  input: Partial<{
    name: string; businessType: string | null; country: string;
    currency: string; timezone: string; contactEmail: string | null;
    phone: string | null; address: string | null;
  }>,
) {
  const before = await prisma.organization.findUnique({ where: { id: ctx.org.id } });
  if (!before) throw notFound();
  const updated = await prisma.organization.update({
    where: { id: ctx.org.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      businessType: input.businessType ?? before.businessType,
      country: input.country ?? before.country,
      currency: input.currency ?? before.currency,
      timezone: input.timezone ?? before.timezone,
      contactEmail: input.contactEmail ?? before.contactEmail,
      phone: input.phone ?? before.phone,
      address: input.address ?? before.address,
    },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "ORG_SETTINGS_UPDATE", entityType: "Organization", entityId: ctx.org.id,
    before: { name: before.name, currency: before.currency, timezone: before.timezone },
    after: { name: updated.name, currency: updated.currency, timezone: updated.timezone },
  });
  return updated;
}

// ---------- Langganan ----------

export async function changePlan(
  ctx: { org: { id: string }; user: { id: string } },
  planCode: string,
) {
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan || !plan.isActive) throw badRequest("Paket tidak tersedia.");
  const sub = await prisma.subscription.findUnique({
    where: { organizationId: ctx.org.id },
    include: { plan: true },
  });
  if (!sub) throw notFound("Langganan organisasi tidak ditemukan.");

  // Validasi: penurunan paket tidak boleh melanggar penggunaan saat ini (PRD §19.2)
  const [itemCount, memberCount, whCount] = await Promise.all([
    prisma.item.count({ where: { organizationId: ctx.org.id } }),
    prisma.membership.count({ where: { organizationId: ctx.org.id, isActive: true } }),
    prisma.warehouse.count({ where: { organizationId: ctx.org.id } }),
  ]);
  if (plan.maxItems !== null && itemCount > plan.maxItems) {
    throw conflict(`Item saat ini (${itemCount}) melebihi batas paket ${plan.name} (${plan.maxItems}).`);
  }
  if (plan.maxUsers !== null && memberCount > plan.maxUsers) {
    throw conflict(`Pengguna aktif saat ini (${memberCount}) melebihi batas paket ${plan.name} (${plan.maxUsers}).`);
  }
  if (plan.maxWarehouses !== null && whCount > plan.maxWarehouses) {
    throw conflict(`Gudang saat ini (${whCount}) melebihi batas paket ${plan.name} (${plan.maxWarehouses}).`);
  }

  const updated = await prisma.subscription.update({
    where: { organizationId: ctx.org.id },
    data: { planId: plan.id, status: "ACTIVE" },
  });
  await logAudit(prisma, {
    orgId: ctx.org.id, userId: ctx.user.id,
    action: "SUBSCRIPTION_CHANGE", entityType: "Subscription", entityId: sub.id,
    before: { plan: sub.plan.code }, after: { plan: plan.code },
    reason: "Perubahan manual oleh owner (belum ada payment gateway)",
  });
  return updated;
}
