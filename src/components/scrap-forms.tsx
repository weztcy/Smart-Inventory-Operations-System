"use client";

// Form scrap: catat scrap baru, klasifikasi ulang, dan disposal.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { Button, Field, Input, Select, Textarea } from "@/components/form";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { SCRAP_CATEGORIES, SCRAP_CATEGORY_LABELS, type ScrapCategory } from "@/lib/constants";
import type { ItemOption, LocationOption } from "@/lib/client/types";

export interface MoOption {
  id: string;
  number: string;
  label: string;
}

export function ScrapCreateForm({
  sourceItems, scrapItems, locations, mos,
}: {
  sourceItems: ItemOption[];
  scrapItems: ItemOption[];
  locations: LocationOption[];
  mos: MoOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    productionOrderId: "",
    sourceItemId: "",
    sourceLocationId: "",
    scrapItemId: "",
    scrapQty: "",
    category: "PENDING",
    destinationLocationId: "",
    cause: "",
    estimatedValue: "",
    notes: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/scrap", {
        method: "POST",
        body: {
          ...form,
          productionOrderId: form.productionOrderId || null,
          destinationLocationId: form.destinationLocationId || null,
          cause: form.cause || null,
          estimatedValue: form.estimatedValue === "" ? null : form.estimatedValue,
          notes: form.notes || null,
        },
      });
      toast.push("Scrap tercatat dan masuk sebagai stok terlacak.", "success");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Gagal mencatat scrap", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ Catat Scrap</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Catat Scrap / Material Sisa" wide>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Material sumber" required hint="Material yang menghasilkan sisa.">
              <Select value={form.sourceItemId} onChange={(e) => setForm({ ...form, sourceItemId: e.target.value })} required>
                <option value="">— Pilih —</option>
                {sourceItems.map((i) => (
                  <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Lokasi asal proses" required>
              <Select value={form.sourceLocationId} onChange={(e) => setForm({ ...form, sourceLocationId: e.target.value })} required>
                <option value="">— Pilih —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.warehouseCode} / {l.code}</option>
                ))}
              </Select>
            </Field>
            <Field label="Item scrap" required hint="Item bertipe SCRAP sebagai identitas stok sisa.">
              <Select value={form.scrapItemId} onChange={(e) => setForm({ ...form, scrapItemId: e.target.value })} required>
                <option value="">— Pilih —</option>
                {scrapItems.map((i) => (
                  <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Kuantitas scrap" required>
              <Input type="number" step="0.0001" min="0.0001" value={form.scrapQty} onChange={(e) => setForm({ ...form, scrapQty: e.target.value })} required />
            </Field>
            <Field label="Kategori" required>
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {SCRAP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{SCRAP_CATEGORY_LABELS[c]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Lokasi penyimpanan scrap" hint="Default mengikuti lokasi asal.">
              <Select value={form.destinationLocationId} onChange={(e) => setForm({ ...form, destinationLocationId: e.target.value })}>
                <option value="">Sama dengan lokasi asal</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.warehouseCode} / {l.code} — {l.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Estimasi nilai pulih" hint="Opsional; estimasi, bukan pendapatan.">
              <Input type="number" step="0.0001" min="0" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} />
            </Field>
            <Field label="Work order terkait">
              <Select value={form.productionOrderId} onChange={(e) => setForm({ ...form, productionOrderId: e.target.value })}>
                <option value="">— Tanpa MO —</option>
                {mos.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Penyebab">
            <Input value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })} placeholder="mis. sisa potong plat, cacat las" />
          </Field>
          <Field label="Catatan">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <p className="text-xs text-slate-400">
            Pencatatan scrap menambah stok item scrap (transaksi SCRAP_IN) — material sumber tidak
            dikurangi dua kali karena konsumsi produksi sudah menguranginya.
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={loading}>Simpan & Posting</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ClassifyForm({ scrapId, current }: { scrapId: string; current: string }) {
  const router = useRouter();
  const toast = useToast();
  const [category, setCategory] = useState(current);
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44 py-1 text-xs">
        {SCRAP_CATEGORIES.map((c) => (
          <option key={c} value={c}>{SCRAP_CATEGORY_LABELS[c as ScrapCategory]}</option>
        ))}
      </Select>
      <Button
        size="sm" variant="secondary" loading={loading} disabled={category === current}
        onClick={async () => {
          setLoading(true);
          try {
            await api(`/api/scrap/${scrapId}/classify`, { method: "POST", body: { category } });
            toast.push("Klasifikasi diperbarui.", "success");
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
    </div>
  );
}

export function DisposeForm({
  scrapRecordId, itemId, itemCode, maxQty, uomCode, locations,
}: {
  scrapRecordId?: string;
  itemId?: string;
  itemCode?: string;
  maxQty?: string;
  uomCode?: string;
  locations: LocationOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ locationId: "", quantity: maxQty ?? "", method: "penjualan limbah", reason: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/scrap/dispose", {
        method: "POST",
        body: {
          scrapRecordId: scrapRecordId ?? null,
          itemId,
          locationId: form.locationId,
          quantity: form.quantity,
          method: form.method || undefined,
          reason: form.reason,
        },
      });
      toast.push("Disposal diposting — stok scrap berkurang.", "success");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Gagal membuang scrap", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>Buang</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Pembuangan${itemCode ? ` — ${itemCode}` : ""}`}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Lokasi sumber" required>
            <Select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} required>
              <option value="">— Pilih —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.warehouseCode} / {l.code}</option>
              ))}
            </Select>
          </Field>
          <Field label="Kuantitas dibuang" required={true} hint={maxQty ? `Maksimum tersedia: ${Number(maxQty)} ${uomCode ?? ""}` : undefined}>
            <Input type="number" step="0.0001" min="0.0001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </Field>
          <Field label="Metode">
            <Input value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} placeholder="dijual ke pengepul / limbah B3 / dll" />
          </Field>
          <Field label="Alasan wajib" required>
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required placeholder="mis. tidak layak pakai" />
          </Field>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Batal</Button>
            <Button variant="danger" type="submit" loading={loading}>Posting Pembuangan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
