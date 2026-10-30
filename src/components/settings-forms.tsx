"use client";

// Pengaturan: profil organisasi, anggota & undangan, pilihan paket.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { Button, Field, Input, Select, Textarea } from "@/components/form";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, type Role } from "@/lib/constants";

export function OrgSettingsForm({
  org,
}: {
  org: {
    name: string; businessType: string | null; country: string;
    currency: string; timezone: string; contactEmail: string | null;
    phone: string | null; address: string | null;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({
    name: org.name,
    businessType: org.businessType ?? "",
    country: org.country,
    currency: org.currency,
    timezone: org.timezone,
    contactEmail: org.contactEmail ?? "",
    phone: org.phone ?? "",
    address: org.address ?? "",
  });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/settings/organization", {
        method: "PUT",
        body: {
          name: form.name,
          businessType: form.businessType || null,
          country: form.country,
          currency: form.currency,
          timezone: form.timezone,
          contactEmail: form.contactEmail || null,
          phone: form.phone || null,
          address: form.address || null,
        },
      });
      toast.push("Pengaturan organisasi tersimpan.", "success");
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Gagal menyimpan", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
      <Field label="Nama organisasi" required>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </Field>
      <Field label="Jenis bisnis">
        <Input value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })} />
      </Field>
      <Field label="Mata uang">
        <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          <option value="IDR">IDR — Rupiah</option>
          <option value="USD">USD — Dollar</option>
          <option value="EUR">EUR — Euro</option>
        </Select>
      </Field>
      <Field label="Zona waktu">
        <Select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
          <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
          <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
          <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
        </Select>
      </Field>
      <Field label="Email kontak">
        <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
      </Field>
      <Field label="Telepon">
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Alamat">
          <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
      </div>
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" loading={loading}>Simpan Pengaturan</Button>
      </div>
    </form>
  );
}

export function InviteForm() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("WAREHOUSE");
  const [loading, setLoading] = useState(false);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api<{ claimUrl: string }>("/api/settings/members", {
        method: "POST",
        body: { email, role },
      });
      setClaimUrl(r.claimUrl);
      toast.push("Undangan dibuat (berlaku 7 hari).", "success");
      setEmail("");
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Gagal mengundang", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-52 flex-1">
          <Field label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="rekan@perusahaan.com" />
          </Field>
        </div>
        <div className="w-56">
          <Field label="Peran awal" required>
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.filter((r) => r !== "OWNER").map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" loading={loading}>Undang</Button>
      </form>
      <p className="px-5 pb-4 text-xs text-slate-400">
        {ROLE_DESCRIPTIONS[role as Role]}
      </p>
      <Modal open={!!claimUrl} onClose={() => setClaimUrl(null)} title="Tautan Undangan">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Pengiriman email otomatis belum dikonfigurasi (memerlukan SMTP). Bagikan tautan klaim
            berikut secara manual — berlaku 7 hari dan sekali pakai:
          </p>
          <code className="block break-all rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
            {claimUrl ? `${window.location.origin}${claimUrl}` : ""}
          </code>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setClaimUrl(null)}>Tutup</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function MemberRoleSelect({ membershipId, current }: { membershipId: string; current: string }) {
  const router = useRouter();
  const toast = useToast();
  const [role, setRole] = useState(current);
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={role}
        disabled={current === "OWNER"}
        onChange={(e) => setRole(e.target.value)}
        className="w-44 py-1 text-xs"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
        ))}
      </Select>
      {current !== "OWNER" ? (
        <Button
          size="sm" variant="secondary" loading={loading} disabled={role === current}
          onClick={async () => {
            setLoading(true);
            try {
              await api(`/api/settings/members/${membershipId}`, { method: "PATCH", body: { role } });
              toast.push("Peran diperbarui.", "success");
              router.refresh();
            } catch (e) {
              toast.push(e instanceof Error ? e.message : "Gagal", "error");
            } finally {
              setLoading(false);
            }
          }}
        >
          Simpan
        </Button>
      ) : null}
    </div>
  );
}

export function MemberActiveToggle({ membershipId, isActive }: { membershipId: string; isActive: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm" variant="ghost" loading={loading}
      onClick={async () => {
        if (!confirm(isActive ? "Nonaktifkan akses anggota ini?" : "Aktifkan kembali akses?")) return;
        setLoading(true);
        try {
          await api(`/api/settings/members/${membershipId}`, { method: "PATCH", body: { isActive: !isActive } });
          toast.push("Akses diperbarui.", "success");
          router.refresh();
        } catch (e) {
          toast.push(e instanceof Error ? e.message : "Gagal", "error");
        } finally {
          setLoading(false);
        }
      }}
    >
      {isActive ? "Nonaktifkan" : "Aktifkan"}
    </Button>
  );
}

export function RevokeInviteButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm" variant="ghost" loading={loading}
      onClick={async () => {
        if (!confirm("Batalkan undangan ini?")) return;
        setLoading(true);
        try {
          await api(`/api/settings/invitations/${invitationId}/revoke`, { method: "POST" });
          toast.push("Undangan dibatalkan.", "success");
          router.refresh();
        } catch (e) {
          toast.push(e instanceof Error ? e.message : "Gagal", "error");
        } finally {
          setLoading(false);
        }
      }}
    >
      Batalkan
    </Button>
  );
}

export function PlanSelector({
  currentPlan, plans,
}: {
  currentPlan: string | null;
  plans: { code: string; name: string; description: string | null; priceMonthly: number; maxItems: number | null; maxUsers: number | null; maxWarehouses: number | null }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [loadingCode, setLoadingCode] = useState<string | null>(null);

  async function choose(code: string) {
    if (code === currentPlan) return;
    if (!confirm(`Ubah paket ke ${code}? Perubahan manual (payment gateway belum terintegrasi).`)) return;
    setLoadingCode(code);
    try {
      await api("/api/settings/subscription", { method: "POST", body: { planCode: code } });
      toast.push(`Paket diubah ke ${code}.`, "success");
      router.refresh();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Gagal mengubah paket", "error");
    } finally {
      setLoadingCode(null);
    }
  }

  return (
    <div className="grid gap-4 p-5 sm:grid-cols-3">
      {plans.map((p) => {
        const active = p.code === currentPlan;
        return (
          <div
            key={p.code}
            className={`rounded-xl border p-5 ${active ? "border-indigo-500 ring-2 ring-indigo-100" : "border-slate-200"}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{p.name}</h3>
              {active ? (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">aktif</span>
              ) : null}
            </div>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {p.priceMonthly === 0 ? "Gratis" : `Rp ${p.priceMonthly.toLocaleString("id-ID")}`}
              {p.priceMonthly > 0 ? <span className="text-xs font-normal text-slate-400">/bulan</span> : null}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{p.description}</p>
            <ul className="mt-3 space-y-1 text-xs text-slate-600">
              <li>Item: {p.maxItems === null ? "tanpa batas" : p.maxItems}</li>
              <li>Pengguna: {p.maxUsers === null ? "tanpa batas" : p.maxUsers}</li>
              <li>Gudang: {p.maxWarehouses === null ? "tanpa batas" : p.maxWarehouses}</li>
            </ul>
            <Button
              className="mt-4 w-full"
              variant={active ? "secondary" : "primary"}
              disabled={active}
              loading={loadingCode === p.code}
              onClick={() => choose(p.code)}
            >
              {active ? "Paket Saat Ini" : "Pilih Paket"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
