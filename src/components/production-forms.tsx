"use client";

// Form produksi: BOM, production order, konsumsi material, output, penyelesaian.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { Button, Field, Input, Select, Textarea } from "@/components/form";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import type { ItemOption, LocationOption, WarehouseOption } from "@/lib/client/types";

let seq = 1;

// ---------- BOM ----------

export function BOMCreateForm({ items }: { items: ItemOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [itemId, setItemId] = useState("");
  const [outputQty, setOutputQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [components, setComponents] = useState([{ key: seq++, componentItemId: "", quantity: "", scrapPercent: "0" }]);

  async function submit() {
    setLoading(true);
    try {
      const comps = components
        .filter((c) => c.componentItemId && Number(c.quantity) > 0)
        .map((c) => ({
          componentItemId: c.componentItemId,
          quantity: c.quantity,
          scrapPercent: c.scrapPercent || "0",
        }));
      if (!itemId || comps.length === 0) {
        toast.push("Pilih produk dan minimal satu komponen.", "error");
        setLoading(false);
        return;
      }
      const r = await api<{ bom: { code: string } }>("/api/boms", {
        method: "POST",
        body: { itemId, outputQty, notes: notes || null, components: comps },
      });
      toast.push(`BOM ${r.bom.code} dibuat.`, "success");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Gagal membuat BOM", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ BOM Baru</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Bill of Materials Baru" wide>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Produk jadi" required hint="Item baru otomatis mendapat versi 1; perubahan berarti versi baru.">
              <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="">— Pilih —</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Kuantitas output BOM" required hint="mis. 1 unit produk per resep ini">
              <Input type="number" step="0.0001" min="0.0001" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} />
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-slate-500">Komponen</p>
            {components.map((c, idx) => (
              <div key={c.key} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-12">
                <div className="sm:col-span-7">
                  <Field label={`Komponen ${idx + 1}`} required>
                    <Select value={c.componentItemId} onChange={(e) => setComponents((cs) => cs.map((x) => (x.key === c.key ? { ...x, componentItemId: e.target.value } : x)))}>
                      <option value="">— Pilih —</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field label="Qty per output" required>
                    <Input type="number" step="0.0001" min="0.0001" value={c.quantity} onChange={(e) => setComponents((cs) => cs.map((x) => (x.key === c.key ? { ...x, quantity: e.target.value } : x)))} />
                  </Field>
                </div>
                <div className="sm:col-span-1">
                  <Field label="% scrap">
                    <Input type="number" step="0.1" min="0" value={c.scrapPercent} onChange={(e) => setComponents((cs) => cs.map((x) => (x.key === c.key ? { ...x, scrapPercent: e.target.value } : x)))} />
                  </Field>
                </div>
                <div className="flex items-end sm:col-span-1">
                  <Button variant="ghost" size="sm" disabled={components.length <= 1} onClick={() => setComponents((cs) => cs.length > 1 ? cs.filter((x) => x.key !== c.key) : cs)}>
                    Hapus
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setComponents((cs) => [...cs, { key: seq++, componentItemId: "", quantity: "", scrapPercent: "0" }])}>
              + Tambah komponen
            </Button>
          </div>

          <Field label="Catatan">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button loading={loading} onClick={submit}>Simpan BOM</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function BOMArchiveButton({ bomId }: { bomId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm" variant="ghost" loading={loading}
      onClick={async () => {
        if (!confirm("Arsipkan BOM? Histori MO yang memakainya tetap utuh.")) return;
        setLoading(true);
        try {
          await api(`/api/boms/${bomId}`, { method: "DELETE" });
          toast.push("BOM diarsipkan.", "success");
          router.refresh();
        } catch (e) {
          toast.push(e instanceof Error ? e.message : "Gagal", "error");
        } finally {
          setLoading(false);
        }
      }}
    >
      Arsipkan
    </Button>
  );
}

// ---------- Production Order ----------

export interface BomOption {
  id: string;
  code: string;
  productCode: string;
  productName: string;
  version: number;
}

export function MOCreateForm({
  items, boms, warehouses,
}: {
  items: ItemOption[];
  boms: BomOption[];
  warehouses: WarehouseOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    itemId: "", bomId: "", plannedQty: "",
    plannedStartDate: "", plannedEndDate: "",
    sourceWarehouseId: warehouses[0]?.id ?? "",
    destinationWarehouseId: "", assignedTo: "", notes: "",
  });

  const filteredBoms = boms.filter((b) => !form.itemId || b.productCode === items.find((i) => i.id === form.itemId)?.code);

  async function submit() {
    setLoading(true);
    try {
      await api("/api/production-orders", {
        method: "POST",
        body: {
          ...form,
          plannedStartDate: form.plannedStartDate || null,
          plannedEndDate: form.plannedEndDate || null,
          destinationWarehouseId: form.destinationWarehouseId || null,
          assignedTo: form.assignedTo || null,
          notes: form.notes || null,
        },
      });
      toast.push("Production order dibuat (draft).", "success");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Gagal membuat MO", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ Work Order</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Production Order Baru" wide>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Produk" required>
              <Select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value, bomId: "" })}>
                <option value="">— Pilih —</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="BOM" required>
              <Select value={form.bomId} onChange={(e) => setForm({ ...form, bomId: e.target.value })}>
                <option value="">— Pilih —</option>
                {filteredBoms.map((b) => (
                  <option key={b.id} value={b.id}>{b.code} v{b.version} ({b.productCode})</option>
                ))}
              </Select>
            </Field>
            <Field label="Kuantitas rencana" required>
              <Input type="number" step="0.0001" min="0.0001" value={form.plannedQty} onChange={(e) => setForm({ ...form, plannedQty: e.target.value })} />
            </Field>
            <Field label="Gudang sumber material" required>
              <Select value={form.sourceWarehouseId} onChange={(e) => setForm({ ...form, sourceWarehouseId: e.target.value })}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Gudang tujuan hasil">
              <Select value={form.destinationWarehouseId} onChange={(e) => setForm({ ...form, destinationWarehouseId: e.target.value })}>
                <option value="">Sama dengan sumber</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Penanggung jawab">
              <Input value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} placeholder="Nama operator" />
            </Field>
            <Field label="Rencana mulai">
              <Input type="date" value={form.plannedStartDate} onChange={(e) => setForm({ ...form, plannedStartDate: e.target.value })} />
            </Field>
            <Field label="Rencana selesai">
              <Input type="date" value={form.plannedEndDate} onChange={(e) => setForm({ ...form, plannedEndDate: e.target.value })} />
            </Field>
          </div>
          <Field label="Catatan">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button loading={loading} onClick={submit}>Simpan Draft</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ---------- Aksi MO ----------

export function MOActionButton({
  moId, action, label, variant = "primary", confirmText, body,
}: {
  moId: string;
  action: "confirm" | "start" | "cancel" | "complete";
  label: string;
  variant?: "primary" | "secondary" | "danger" | "success";
  confirmText?: string;
  body?: Record<string, unknown>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm" variant={variant} loading={loading}
      onClick={async () => {
        if (confirmText && !confirm(confirmText)) return;
        setLoading(true);
        try {
          await api(`/api/production-orders/${moId}/${action}`, { method: "POST", body: body ?? {} });
          toast.push("Aksi berhasil.", "success");
          router.refresh();
        } catch (e) {
          toast.push(e instanceof Error ? e.message : "Gagal", "error");
        } finally {
          setLoading(false);
        }
      }}
    >
      {label}
    </Button>
  );
}

export function ConsumeForm({
  moId, components, locations,
}: {
  moId: string;
  components: { itemId: string; code: string; name: string; uomCode: string; planned: string; defaultLocationId?: string }[];
  locations: LocationOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<Record<string, { locationId: string; qty: string }>>({});

  async function submit() {
    setLoading(true);
    try {
      const body = {
        lines: components
          .filter((c) => Number(lines[c.itemId]?.qty ?? 0) > 0)
          .map((c) => ({
            itemId: c.itemId,
            sourceLocationId: lines[c.itemId].locationId,
            actualQty: lines[c.itemId].qty,
          })),
      };
      if (body.lines.length === 0) {
        toast.push("Isi kuantitas konsumsi minimal satu komponen.", "error");
        setLoading(false);
        return;
      }
      if (body.lines.some((l) => !l.sourceLocationId)) {
        toast.push("Pilih lokasi sumber untuk setiap komponen yang dikonsumsi.", "error");
        setLoading(false);
        return;
      }
      const r = await api<{ number: string }>(`/api/production-orders/${moId}/consume`, { method: "POST", body });
      toast.push(`Konsumsi ${r.number} diposting — stok material berkurang.`, "success");
      setOpen(false);
      setLines({});
      router.refresh();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Gagal mencatat konsumsi", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Catat Konsumsi</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Catat Konsumsi Material Aktual" wide>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Kuantitas aktual boleh berbeda dari rencana BOM — variance dihitung otomatis. Kosongkan
            komponen yang belum dipakai.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2">Komponen</th>
                  <th className="py-2 text-right">Rencana</th>
                  <th className="py-2">Lokasi sumber</th>
                  <th className="py-2 text-right">Aktual dipakai</th>
                </tr>
              </thead>
              <tbody>
                {components.map((c) => (
                  <tr key={c.itemId} className="border-b border-slate-100">
                    <td className="py-2">
                      <span className="font-medium">{c.code}</span>
                      <span className="ml-1.5 text-xs text-slate-500">{c.name}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{Number(c.planned).toFixed(2)} {c.uomCode}</td>
                    <td className="py-2">
                      <Select
                        value={lines[c.itemId]?.locationId ?? ""}
                        onChange={(e) => setLines({ ...lines, [c.itemId]: { locationId: e.target.value, qty: lines[c.itemId]?.qty ?? "" } })}
                        className="w-48"
                      >
                        <option value="">— Pilih —</option>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>{l.warehouseCode} / {l.code}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-2 text-right">
                      <Input
                        type="number" step="0.0001" min="0"
                        value={lines[c.itemId]?.qty ?? ""}
                        onChange={(e) => setLines({ ...lines, [c.itemId]: { locationId: lines[c.itemId]?.locationId ?? "", qty: e.target.value } })}
                        className="w-24 text-right"
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button loading={loading} onClick={submit}>Posting Konsumsi</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function OutputForm({
  moId, productCode, productName, plannedQty, locations,
}: {
  moId: string;
  productCode: string;
  productName: string;
  plannedQty: string;
  locations: LocationOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actualQty, setActualQty] = useState("");
  const [locationId, setLocationId] = useState("");

  async function submit() {
    setLoading(true);
    try {
      if (!locationId || !(Number(actualQty) > 0)) {
        toast.push("Isi lokasi tujuan dan kuantitas output.", "error");
        setLoading(false);
        return;
      }
      const r = await api<{ number: string }>(`/api/production-orders/${moId}/output`, {
        method: "POST",
        body: { destinationLocationId: locationId, actualQty },
      });
      toast.push(`Output ${r.number} diposting — stok barang jadi bertambah.`, "success");
      setOpen(false);
      setActualQty("");
      router.refresh();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Gagal mencatat output", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Catat Hasil Produksi</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Catat Hasil Produksi">
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-medium">{productCode} — {productName}</p>
            <p className="text-xs text-slate-500">Rencana: {Number(plannedQty)} unit</p>
          </div>
          <Field label="Output baik aktual" required hint="Kurang dari rencana akan tercatat sebagai variance output.">
            <Input type="number" step="0.0001" min="0.0001" value={actualQty} onChange={(e) => setActualQty(e.target.value)} />
          </Field>
          <Field label="Lokasi tujuan (barang jadi)" required>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">— Pilih —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.warehouseCode} / {l.code} — {l.name}</option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-slate-400">
            Material sisa/scrap dicatat terpisah di modul Scrap agar tidak terjadi hitung ganda.
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button variant="success" loading={loading} onClick={submit}>Posting Output</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
