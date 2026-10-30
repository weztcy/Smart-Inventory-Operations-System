"use client";

// Form master data: item (buat/edit), kategori, satuan+konversi,
// supplier, customer, gudang, lokasi.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { Button, Field, Input, Select, Textarea } from "@/components/form";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { ITEM_TYPES, ITEM_TYPE_LABELS, LOCATION_TYPES, LOCATION_TYPE_LABELS, ROLES, ROLE_LABELS } from "@/lib/constants";
import type {
  CategoryOption, UomOption, WarehouseOption,
} from "@/lib/client/types";

// ---------- Item ----------

export interface ItemEditData {
  id: string;
  code: string;
  name: string;
  type: string;
  baseUomId: string;
  categoryId: string | null;
  description: string | null;
  barcode: string | null;
  minStock: string | null;
  reorderQty: string | null;
  defaultCost: string | null;
  notes: string | null;
}

export function ItemFormButton({
  categories, uoms, edit,
}: {
  categories: CategoryOption[];
  uoms: UomOption[];
  edit?: ItemEditData;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    code: edit?.code ?? "",
    name: edit?.name ?? "",
    type: edit?.type ?? "RAW_MATERIAL",
    baseUomId: edit?.baseUomId ?? "",
    categoryId: edit?.categoryId ?? "",
    description: edit?.description ?? "",
    barcode: edit?.barcode ?? "",
    minStock: edit?.minStock ?? "",
    reorderQty: edit?.reorderQty ?? "",
    defaultCost: edit?.defaultCost ?? "",
    notes: edit?.notes ?? "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body = {
        ...form,
        categoryId: form.categoryId || null,
        description: form.description || null,
        barcode: form.barcode || null,
        minStock: form.minStock === "" ? null : form.minStock,
        reorderQty: form.reorderQty === "" ? null : form.reorderQty,
        defaultCost: form.defaultCost === "" ? null : form.defaultCost,
        notes: form.notes || null,
      };
      if (edit) {
        await api(`/api/items/${edit.id}`, { method: "PUT", body });
        toast.push(`Item ${body.code} diperbarui.`, "success");
      } else {
        await api("/api/items", { method: "POST", body });
        toast.push(`Item ${body.code} dibuat.`, "success");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Gagal menyimpan item", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {edit ? (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Edit</Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>+ Item Baru</Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={edit ? `Edit Item ${edit.code}` : "Item Baru"} wide>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="SKU / Kode" required>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="STEEL-PLATE-3MM" />
            </Field>
            <Field label="Nama item" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Plat Baja 3mm" />
            </Field>
            <Field label="Tipe item" required>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Satuan dasar" required>
              <Select value={form.baseUomId} onChange={(e) => setForm({ ...form, baseUomId: e.target.value })} required disabled={!!edit}>
                <option value="">— Pilih —</option>
                {uoms.map((u) => (
                  <option key={u.id} value={u.id}>{u.code} ({u.name})</option>
                ))}
              </Select>
            </Field>
            <Field label="Kategori">
              <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">— Tanpa kategori —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Barcode">
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </Field>
            <Field label="Stok minimum">
              <Input type="number" step="0.0001" min="0" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
            </Field>
            <Field label="Kuantitas reorder">
              <Input type="number" step="0.0001" min="0" value={form.reorderQty} onChange={(e) => setForm({ ...form, reorderQty: e.target.value })} />
            </Field>
            <Field label="Biaya default">
              <Input type="number" step="0.000001" min="0" value={form.defaultCost} onChange={(e) => setForm({ ...form, defaultCost: e.target.value })} />
            </Field>
          </div>
          <Field label="Deskripsi">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Catatan">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {edit ? (
            <p className="text-xs text-slate-400">
              Satuan dasar dikunci karena perubahan satuan pada item bertransaksi tidak diizinkan
              (konsistensi histori).
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={loading}>{edit ? "Simpan Perubahan" : "Buat Item"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ItemToggleActive({ itemId, isActive }: { itemId: string; isActive: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={loading}
      onClick={async () => {
        if (!confirm(isActive ? "Nonaktifkan item ini? Item nonaktif tidak dapat dipakai transaksi baru." : "Aktifkan kembali item ini?")) return;
        setLoading(true);
        try {
          await api(`/api/items/${itemId}`, { method: "PATCH", body: { isActive: !isActive } });
          toast.push("Status item diperbarui.", "success");
          router.refresh();
        } catch (e) {
          toast.push(e instanceof Error ? e.message : "Gagal mengubah status", "error");
        } finally {
          setLoading(false);
        }
      }}
    >
      {isActive ? "Nonaktifkan" : "Aktifkan"}
    </Button>
  );
}

// ---------- Kategori ----------

export function CategoryCreateForm() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ Kategori</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Kategori Baru">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              await api("/api/categories", { method: "POST", body: { name, description: description || undefined } });
              toast.push("Kategori dibuat.", "success");
              setOpen(false);
              setName(""); setDescription("");
              router.refresh();
            } catch (err) {
              toast.push(err instanceof Error ? err.message : "Gagal", "error");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="Nama kategori" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Steel" />
          </Field>
          <Field label="Deskripsi">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={loading}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function CategoryDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm" variant="ghost" loading={loading}
      onClick={async () => {
        if (!confirm("Hapus kategori ini? Gagal bila masih dipakai item.")) return;
        setLoading(true);
        try {
          await api(`/api/categories/${id}`, { method: "DELETE" });
          toast.push("Kategori dihapus.", "success");
          router.refresh();
        } catch (e) {
          toast.push(e instanceof Error ? e.message : "Gagal", "error");
        } finally {
          setLoading(false);
        }
      }}
    >
      Hapus
    </Button>
  );
}

// ---------- Satuan ----------

export function UomCreateForm() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ Satuan</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Satuan Baru">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              await api("/api/uoms", { method: "POST", body: { code, name } });
              toast.push("Satuan dibuat.", "success");
              setOpen(false); setCode(""); setName("");
              router.refresh();
            } catch (err) {
              toast.push(err instanceof Error ? err.message : "Gagal", "error");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="Kode" required hint="mis. drum, pallet">
            <Input value={code} onChange={(e) => setCode(e.target.value)} required />
          </Field>
          <Field label="Nama" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={loading}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ConversionCreateForm({ uoms }: { uoms: UomOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [factor, setFactor] = useState("");

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>+ Konversi</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Konversi Satuan Baru">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              await api("/api/uoms/conversions", { method: "POST", body: { fromUomId: from, toUomId: to, factor } });
              toast.push("Konversi dibuat.", "success");
              setOpen(false); setFrom(""); setTo(""); setFactor("");
              router.refresh();
            } catch (err) {
              toast.push(err instanceof Error ? err.message : "Gagal", "error");
            } finally {
              setLoading(false);
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Dari satuan" required>
              <Select value={from} onChange={(e) => setFrom(e.target.value)} required>
                <option value="">—</option>
                {uoms.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
              </Select>
            </Field>
            <Field label="Ke satuan" required>
              <Select value={to} onChange={(e) => setTo(e.target.value)} required>
                <option value="">—</option>
                {uoms.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
              </Select>
            </Field>
            <Field label="Faktor" required hint="1 dari = faktor ke">
              <Input type="number" step="0.000001" min="0.000001" value={factor} onChange={(e) => setFactor(e.target.value)} required placeholder="12" />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={loading}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------- Supplier / Customer ----------

export function PartnerCreateForm({ kind }: { kind: "supplier" | "customer" }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", contactPerson: "", phone: "", email: "", address: "", taxId: "", notes: "" });

  const isSupplier = kind === "supplier";
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>{isSupplier ? "+ Supplier" : "+ Customer"}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={isSupplier ? "Supplier Baru" : "Customer Baru"}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              await api(isSupplier ? "/api/suppliers" : "/api/customers", {
                method: "POST",
                body: {
                  code: form.code, name: form.name,
                  contactPerson: form.contactPerson || undefined,
                  phone: form.phone || undefined,
                  email: form.email || undefined,
                  address: form.address || undefined,
                  taxId: isSupplier ? form.taxId || undefined : undefined,
                  notes: form.notes || undefined,
                },
              });
              toast.push("Data tersimpan.", "success");
              setOpen(false);
              router.refresh();
            } catch (err) {
              toast.push(err instanceof Error ? err.message : "Gagal", "error");
            } finally {
              setLoading(false);
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kode" required>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder={isSupplier ? "SUP-001" : "CUS-001"} />
            </Field>
            <Field label="Nama" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Kontak">
              <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </Field>
            <Field label="Telepon">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            {isSupplier ? (
              <Field label="NPWP / ID pajak">
                <Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
              </Field>
            ) : null}
          </div>
          <Field label="Alamat">
            <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={loading}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------- Gudang & lokasi ----------

export function WarehouseCreateForm() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", address: "", manager: "" });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ Gudang</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Gudang Baru">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              await api("/api/warehouses", {
                method: "POST",
                body: { code: form.code, name: form.name, address: form.address || undefined, manager: form.manager || undefined },
              });
              toast.push("Gudang dibuat.", "success");
              setOpen(false);
              router.refresh();
            } catch (err) {
              toast.push(err instanceof Error ? err.message : "Gagal", "error");
            } finally {
              setLoading(false);
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kode" required hint="mis. WH-02">
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </Field>
            <Field label="Nama" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
          </div>
          <Field label="Alamat">
            <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Penanggung jawab">
            <Input value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={loading}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function LocationCreateForm({ warehouses }: { warehouses: WarehouseOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ warehouseId: warehouses[0]?.id ?? "", code: "", name: "", type: "GENERAL" });

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>+ Lokasi</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Lokasi Penyimpanan Baru">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              await api("/api/warehouses/locations", {
                method: "POST",
                body: { ...form },
              });
              toast.push("Lokasi dibuat.", "success");
              setOpen(false);
              router.refresh();
            } catch (err) {
              toast.push(err instanceof Error ? err.message : "Gagal", "error");
            } finally {
              setLoading(false);
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Gudang" required>
              <Select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} required>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tipe lokasi" required>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {LOCATION_TYPES.map((t) => (
                  <option key={t} value={t}>{LOCATION_TYPE_LABELS[t]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Kode lokasi" required hint="unik di organisasi, mis. WH-01-CUT">
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </Field>
            <Field label="Nama" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" loading={loading}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ActiveToggle({
  path, isActive, confirmText,
}: {
  path: string; isActive: boolean; confirmText?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm" variant="ghost" loading={loading}
      onClick={async () => {
        if (!confirm(confirmText ?? (isActive ? "Nonaktifkan?" : "Aktifkan kembali?"))) return;
        setLoading(true);
        try {
          await api(path, { method: "PATCH", body: { isActive: !isActive } });
          toast.push("Status diperbarui.", "success");
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
