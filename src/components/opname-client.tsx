"use client";

// Stock opname: mulai penghitungan + isi hasil hitung + rekonsiliasi.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { Button, Field, Input, Select, Textarea } from "@/components/form";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import type { WarehouseOption } from "@/lib/client/types";

export function OpnameCreateForm({
  warehouses,
}: {
  warehouses: (WarehouseOption & { locations: { id: string; code: string; name: string }[] })[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ warehouseId: warehouses[0]?.id ?? "", locationId: "", notes: "" });

  const wh = warehouses.find((w) => w.id === form.warehouseId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/stock-counts", {
        method: "POST",
        body: {
          warehouseId: form.warehouseId,
          locationId: form.locationId || null,
          notes: form.notes || null,
        },
      });
      toast.push("Stock count dimulai — baseline stok sistem tersimpan.", "success");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Gagal memulai opname", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ Mulai Opname</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Mulai Stock Opname">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Gudang" required>
            <Select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value, locationId: "" })} required>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Lokasi (opsional)" hint="Kosongkan untuk seluruh gudang.">
            <Select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
              <option value="">Semua lokasi</option>
              {wh?.locations.map((l) => (
                <option key={l.id} value={l.id}>{l.code} — {l.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Catatan">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="mis. opname bulanan gudang utama" />
          </Field>
          <p className="text-xs text-slate-400">
            Sistem menyimpan snapshot stok sebagai baseline. Rekonsiliasi membandingkan hasil hitung
            fisik dengan stok <strong>saat rekonsiliasi</strong>, sehingga transaksi yang terjadi
            selama penghitungan tidak tertimpa.
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={loading}>Mulai</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function CountSheet({
  countId, lines, editable,
}: {
  countId: string;
  lines: { lineId: string; itemCode: string; itemName: string; uomCode: string; locationCode: string; baselineQty: string; countedDisplay?: string }[];
  editable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const filled = Object.values(counts).filter((v) => v !== "").length;

  async function save() {
    setSaving(true);
    try {
      await api(`/api/stock-counts/${countId}/save`, {
        method: "POST",
        body: {
          lines: lines.map((l) => ({ lineId: l.lineId, countedQty: counts[l.lineId] ?? null })),
        },
      });
      toast.push("Hasil hitung tersimpan.", "success");
      router.refresh();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Gagal menyimpan", "error");
    } finally {
      setSaving(false);
    }
  }

  async function reconcile() {
    if (!confirm(
      "Rekonsiliasi akan memposting penyesuaian stok untuk selisih yang ditemukan. Lanjutkan?",
    )) return;
    setReconciling(true);
    try {
      const r = await api<{ adjustments: number; adjustmentTxId: string | null }>(
        `/api/stock-counts/${countId}/reconcile`,
        { method: "POST" },
      );
      toast.push(
        r.adjustments > 0
          ? `Rekonsiliasi selesai — ${r.adjustments} baris disesuaikan lewat transaksi penyesuaian.`
          : "Rekonsiliasi selesai — tidak ada selisih.",
        "success",
      );
      router.refresh();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Gagal rekonsiliasi", "error");
    } finally {
      setReconciling(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5">Item</th>
              <th className="px-4 py-2.5">Lokasi</th>
              <th className="px-4 py-2.5 text-right">Baseline</th>
              <th className="px-4 py-2.5 text-right">Hitung Fisik</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.lineId} className="border-b border-slate-100">
                <td className="px-4 py-2">
                  <span className="font-medium">{l.itemCode}</span>
                  <span className="ml-1.5 text-xs text-slate-500">{l.itemName}</span>
                </td>
                <td className="px-4 py-2 text-xs">{l.locationCode}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                  {Number(l.baselineQty)} {l.uomCode}
                </td>
                <td className="px-4 py-2 text-right">
                  {editable ? (
                    <Input
                      type="number" step="0.0001" min="0"
                      value={counts[l.lineId] ?? ""}
                      onChange={(e) => setCounts({ ...counts, [l.lineId]: e.target.value })}
                      className="w-28 text-right"
                      placeholder="—"
                    />
                  ) : (
                    <span className="tabular-nums">{l.countedDisplay}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">{filled} dari {lines.length} baris terisi</p>
          <div className="flex gap-2">
            <Button variant="secondary" loading={saving} onClick={save}>Simpan Hasil Hitung</Button>
            <Button loading={reconciling} onClick={reconcile}>Rekonsiliasi & Posting</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function OpnameCancelButton({ countId }: { countId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm" variant="secondary" loading={loading}
      onClick={async () => {
        if (!confirm("Batalkan stock count ini?")) return;
        setLoading(true);
        try {
          await api(`/api/stock-counts/${countId}/cancel`, { method: "POST" });
          toast.push("Stock count dibatalkan.", "success");
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
