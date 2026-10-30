"use client";

// Form purchase order: buat + submit, approve/cancel, dan penerimaan (partial receiving).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { Button, Field, Input, Select, Textarea } from "@/components/form";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import type { ItemOption, SupplierOption, WarehouseOption } from "@/lib/client/types";

let seq = 1;

export function POCreateForm({
  suppliers, items, warehouses,
}: {
  suppliers: SupplierOption[];
  items: ItemOption[];
  warehouses: WarehouseOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [header, setHeader] = useState({
    supplierId: "", orderDate: new Date().toISOString().slice(0, 10),
    expectedDate: "", destinationWarehouseId: "", notes: "",
  });
  const [lines, setLines] = useState([{ key: seq++, itemId: "", orderedQty: "", unitPrice: "" }]);

  async function submit(submitForApproval: boolean) {
    setLoading(true);
    try {
      const body = {
        supplierId: header.supplierId,
        orderDate: header.orderDate,
        expectedDate: header.expectedDate || null,
        destinationWarehouseId: header.destinationWarehouseId || null,
        notes: header.notes || null,
        submit: submitForApproval,
        lines: lines
          .filter((l) => l.itemId && Number(l.orderedQty) > 0)
          .map((l) => ({ itemId: l.itemId, orderedQty: l.orderedQty, unitPrice: l.unitPrice || "0" })),
      };
      if (!body.supplierId || body.lines.length === 0) {
        toast.push("Pilih supplier dan isi minimal satu baris valid.", "error");
        setLoading(false);
        return;
      }
      const r = await api<{ po: { number: string } }>("/api/purchase-orders", { method: "POST", body });
      toast.push(`PO ${r.po.number} dibuat${submitForApproval ? " dan disubmit" : " sebagai draft"}.`, "success");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Gagal membuat PO", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ Purchase Order</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Purchase Order Baru" wide>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Supplier" required>
              <Select value={header.supplierId} onChange={(e) => setHeader({ ...header, supplierId: e.target.value })}>
                <option value="">— Pilih —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tanggal pesan" required>
              <Input type="date" value={header.orderDate} onChange={(e) => setHeader({ ...header, orderDate: e.target.value })} />
            </Field>
            <Field label="Estimasi tiba">
              <Input type="date" value={header.expectedDate} onChange={(e) => setHeader({ ...header, expectedDate: e.target.value })} />
            </Field>
            <Field label="Gudang tujuan">
              <Select value={header.destinationWarehouseId} onChange={(e) => setHeader({ ...header, destinationWarehouseId: e.target.value })}>
                <option value="">—</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div key={l.key} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-12">
                <div className="sm:col-span-6">
                  <Field label={`Item ${idx + 1}`} required>
                    <Select value={l.itemId} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, itemId: e.target.value } : x)))}>
                      <option value="">— Pilih —</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field label="Qty pesan" required>
                    <Input type="number" step="0.0001" min="0.0001" value={l.orderedQty} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, orderedQty: e.target.value } : x)))} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Harga satuan" required>
                    <Input type="number" step="0.000001" min="0" value={l.unitPrice} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, unitPrice: e.target.value } : x)))} />
                  </Field>
                </div>
                <div className="flex items-end sm:col-span-1">
                  <Button variant="ghost" size="sm" disabled={lines.length <= 1} onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls)}>
                    Hapus
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { key: seq++, itemId: "", orderedQty: "", unitPrice: "" }])}>
              + Tambah baris
            </Button>
          </div>

          <Field label="Catatan">
            <Textarea value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} />
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button variant="secondary" loading={loading} onClick={() => submit(false)}>Simpan Draft</Button>
            <Button loading={loading} onClick={() => submit(true)}>Simpan & Submit</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function POActionButton({
  poId, action, label, variant = "primary", confirmText,
}: {
  poId: string; action: "submit" | "approve" | "cancel";
  label: string; variant?: "primary" | "secondary" | "danger" | "success";
  confirmText?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm"
      variant={variant}
      loading={loading}
      onClick={async () => {
        if (confirmText && !confirm(confirmText)) return;
        setLoading(true);
        try {
          await api(`/api/purchase-orders/${poId}/${action}`, { method: "POST" });
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

export interface POReceiveLine {
  poLineId: string;
  itemCode: string;
  itemName: string;
  uomCode: string;
  orderedQty: string;
  receivedQty: string;
  unitPrice: string;
}

export function POReceiveForm({
  poId, lines, locations,
}: {
  poId: string;
  lines: POReceiveLine[];
  locations: { id: string; label: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [reference, setReference] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [costOverride, setCostOverride] = useState<Record<string, string>>({});

  const remaining = (l: POReceiveLine) =>
    Math.max(0, Number(l.orderedQty) - Number(l.receivedQty));

  async function submit() {
    setLoading(true);
    try {
      const body = {
        locationId,
        reference: reference || null,
        lines: lines
          .filter((l) => Number(qty[l.poLineId] ?? 0) > 0)
          .map((l) => ({
            poLineId: l.poLineId,
            receivedQty: qty[l.poLineId],
            unitCost: costOverride[l.poLineId] || null,
          })),
      };
      if (!locationId || body.lines.length === 0) {
        toast.push("Pilih lokasi tujuan dan isi kuantitas penerimaan.", "error");
        setLoading(false);
        return;
      }
      const r = await api<{ number: string }>(`/api/purchase-orders/${poId}/receive`, { method: "POST", body });
      toast.push(`Penerimaan ${r.number} diposting — stok bertambah.`, "success");
      setOpen(false);
      setQty({});
      router.refresh();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Gagal menerima barang", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Terima Barang</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Terima Barang dari PO" wide>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Lokasi tujuan" required>
              <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">— Pilih —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Referensi (surat jalan)">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Dipesan</th>
                  <th className="py-2 text-right">Sudah Diterima</th>
                  <th className="py-2 text-right">Sisa</th>
                  <th className="py-2 text-right">Terima Sekarang</th>
                  <th className="py-2 text-right">Biaya Satuan</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.poLineId} className="border-b border-slate-100">
                    <td className="py-2">
                      <span className="font-medium">{l.itemCode}</span>
                      <span className="ml-1.5 text-xs text-slate-500">{l.itemName}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{Number(l.orderedQty)} {l.uomCode}</td>
                    <td className="py-2 text-right tabular-nums">{Number(l.receivedQty)}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{remaining(l)}</td>
                    <td className="py-2 text-right">
                      <Input
                        type="number" step="0.0001" min="0"
                        max={remaining(l)}
                        value={qty[l.poLineId] ?? ""}
                        onChange={(e) => setQty({ ...qty, [l.poLineId]: e.target.value })}
                        className="w-24 text-right"
                        disabled={remaining(l) <= 0}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <Input
                        type="number" step="0.000001" min="0"
                        value={costOverride[l.poLineId] ?? ""}
                        onChange={(e) => setCostOverride({ ...costOverride, [l.poLineId]: e.target.value })}
                        placeholder={Number(l.unitPrice).toString()}
                        className="w-28 text-right"
                        disabled={remaining(l) <= 0}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400">
            Over-receiving otomatis ditolak server. Penerimaan parsial didukung — status PO
            diperbarui menjadi Partially Received hingga seluruh sisa diterima.
          </p>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button loading={loading} onClick={submit}>Posting Penerimaan</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
