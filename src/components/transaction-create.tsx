"use client";

// Form pembuatan transaksi stok: receipt, issue, transfer, adjustment, saldo awal.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { Button, Field, Input, Select, Textarea } from "@/components/form";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { ISSUE_TYPE_LABELS, ISSUE_TYPES } from "@/lib/constants";
import type { ItemOption, LocationOption, SupplierOption, UomOption } from "@/lib/client/types";

type Kind = "receipt" | "issue" | "transfer" | "adjustment" | "opening";

interface LineState {
  key: number;
  itemId: string;
  quantity: string;
  uomId: string;
  unitCost: string;
  locationId: string; // sumber / tujuan sesuai konteks
  toLocationId: string;
  newQty: string;
}

let seq = 1;
const emptyLine = (): LineState => ({
  key: seq++, itemId: "", quantity: "", uomId: "", unitCost: "",
  locationId: "", toLocationId: "", newQty: "",
});

const TITLES: Record<Kind, string> = {
  receipt: "Penerimaan Barang",
  issue: "Pengeluaran Barang",
  transfer: "Transfer Internal",
  adjustment: "Penyesuaian Stok",
  opening: "Saldo Awal",
};

export function TransactionCreate({
  items, locations, suppliers, uoms, canPost,
}: {
  items: ItemOption[];
  locations: LocationOption[];
  suppliers: SupplierOption[];
  uoms: UomOption[];
  canPost: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [openKind, setOpenKind] = useState<Kind | null>(null);
  const [loading, setLoading] = useState(false);
  const [header, setHeader] = useState({
    supplierId: "", reference: "", notes: "", reason: "",
    issueType: "INTERNAL_USE", destination: "",
    locationId: "", toLocationId: "",
  });
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);

  const uomByItem = useMemo(() => new Map(items.map((i) => [i.id, i.uomId])), [items]);

  function open(kind: Kind) {
    setOpenKind(kind);
    setLines([emptyLine()]);
    setHeader({
      supplierId: "", reference: "", notes: "", reason: "",
      issueType: "INTERNAL_USE", destination: "",
      locationId: "", toLocationId: "",
    });
  }

  function setLine(key: number, patch: Partial<LineState>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function submit(mode: "draft" | "post") {
    if (!openKind) return;
    const kind = openKind;
    setLoading(true);
    try {
      let body: Record<string, unknown>;
      if (kind === "receipt") {
        body = {
          kind, mode,
          supplierId: header.supplierId || null,
          reference: header.reference || null,
          notes: header.notes || null,
          lines: lines
            .filter((l) => l.itemId && Number(l.quantity) > 0)
            .map((l) => ({
              itemId: l.itemId,
              locationId: header.locationId || l.locationId,
              quantity: l.quantity,
              uomId: l.uomId || undefined,
              unitCost: l.unitCost === "" ? null : l.unitCost,
            })),
        };
      } else if (kind === "issue") {
        body = {
          kind, mode,
          issueType: header.issueType,
          destination: header.destination || null,
          reference: header.reference || null,
          notes: header.notes || null,
          lines: lines
            .filter((l) => l.itemId && Number(l.quantity) > 0)
            .map((l) => ({
              itemId: l.itemId,
              locationId: header.locationId || l.locationId,
              quantity: l.quantity,
              uomId: l.uomId || undefined,
            })),
        };
      } else if (kind === "transfer") {
        body = {
          kind, mode,
          notes: header.notes || null,
          lines: lines
            .filter((l) => l.itemId && Number(l.quantity) > 0)
            .map((l) => ({
              itemId: l.itemId,
              locationId: header.locationId,
              toLocationId: header.toLocationId,
              quantity: l.quantity,
              uomId: l.uomId || undefined,
            })),
        };
      } else if (kind === "adjustment") {
        body = {
          kind, mode,
          reason: header.reason,
          notes: header.notes || null,
          lines: lines
            .filter((l) => l.itemId && l.locationId && l.newQty !== "")
            .map((l) => ({
              itemId: l.itemId,
              locationId: l.locationId,
              newQty: l.newQty,
            })),
        };
      } else {
        body = {
          kind,
          reference: header.reference || null,
          notes: header.notes || null,
          lines: lines
            .filter((l) => l.itemId && Number(l.quantity) > 0)
            .map((l) => ({
              itemId: l.itemId,
              locationId: header.locationId || l.locationId,
              quantity: l.quantity,
              uomId: l.uomId || undefined,
              unitCost: l.unitCost === "" ? null : l.unitCost,
            })),
        };
      }

      const minLines = (body.lines as unknown[]).length > 0;
      if (!minLines) {
        toast.push("Isi minimal satu baris item dengan kuantitas valid.", "error");
        setLoading(false);
        return;
      }
      if (kind === "adjustment" && header.reason.trim().length < 3) {
        toast.push("Alasan penyesuaian wajib diisi (min 3 karakter).", "error");
        setLoading(false);
        return;
      }

      const result = await api<{ number: string }>("/api/transactions", { method: "POST", body });
      toast.push(
        mode === "post"
          ? `Transaksi ${result.number} berhasil diposting.`
          : `Draft ${result.number} disimpan — stok berubah setelah diposting.`,
        "success",
      );
      setOpenKind(null);
      router.refresh();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Gagal menyimpan transaksi", "error");
    } finally {
      setLoading(false);
    }
  }

  const kind = openKind;
  const needsHeaderLocation = kind === "receipt" || kind === "issue" || kind === "opening";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => open("receipt")}>+ Penerimaan</Button>
        <Button size="sm" variant="secondary" onClick={() => open("issue")}>+ Pengeluaran</Button>
        <Button size="sm" variant="secondary" onClick={() => open("transfer")}>+ Transfer</Button>
        <Button size="sm" variant="secondary" onClick={() => open("adjustment")}>+ Penyesuaian</Button>
        <Button size="sm" variant="secondary" onClick={() => open("opening")}>+ Saldo Awal</Button>
      </div>

      <Modal open={!!kind} onClose={() => setOpenKind(null)} title={kind ? TITLES[kind] : ""} wide>
        {kind ? (
          <div className="space-y-4">
            {kind === "receipt" || kind === "opening" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {kind === "receipt" ? (
                  <Field label="Supplier (opsional)">
                    <Select value={header.supplierId} onChange={(e) => setHeader({ ...header, supplierId: e.target.value })}>
                      <option value="">— Penerimaan langsung —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                {needsHeaderLocation ? (
                  <Field label="Lokasi tujuan" required>
                    <Select value={header.locationId} onChange={(e) => setHeader({ ...header, locationId: e.target.value })} required>
                      <option value="">— Pilih lokasi —</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.warehouseCode} / {l.code} — {l.name}</option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                <Field label="Referensi eksternal">
                  <Input value={header.reference} onChange={(e) => setHeader({ ...header, reference: e.target.value })} placeholder="No. surat jalan / faktur" />
                </Field>
              </div>
            ) : null}

            {kind === "issue" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Jenis pengeluaran" required>
                  <Select value={header.issueType} onChange={(e) => setHeader({ ...header, issueType: e.target.value })}>
                    {ISSUE_TYPES.map((t) => (
                      <option key={t} value={t}>{ISSUE_TYPE_LABELS[t]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Lokasi sumber" required>
                  <Select value={header.locationId} onChange={(e) => setHeader({ ...header, locationId: e.target.value })} required>
                    <option value="">— Pilih lokasi —</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.warehouseCode} / {l.code} — {l.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Tujuan / penerima">
                  <Input value={header.destination} onChange={(e) => setHeader({ ...header, destination: e.target.value })} placeholder="mis. divisi, customer" />
                </Field>
              </div>
            ) : null}

            {kind === "transfer" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Lokasi asal" required>
                  <Select value={header.locationId} onChange={(e) => setHeader({ ...header, locationId: e.target.value })} required>
                    <option value="">— Pilih —</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.warehouseCode} / {l.code}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Lokasi tujuan" required>
                  <Select value={header.toLocationId} onChange={(e) => setHeader({ ...header, toLocationId: e.target.value })} required>
                    <option value="">— Pilih —</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.warehouseCode} / {l.code}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : null}

            {kind === "adjustment" ? (
              <Field label="Alasan penyesuaian" required hint="Mis. selisih opname fisik, kerusakan, kehilangan.">
                <Input value={header.reason} onChange={(e) => setHeader({ ...header, reason: e.target.value })} placeholder="Wajib diisi" />
              </Field>
            ) : null}

            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={l.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="grid gap-2 sm:grid-cols-12">
                    <div className="sm:col-span-4">
                      <Field label={`Item ${idx + 1}`} required>
                        <Select
                          value={l.itemId}
                          onChange={(e) => {
                            const uomId = uomByItem.get(e.target.value) ?? "";
                            setLine(l.key, { itemId: e.target.value, uomId });
                          }}
                        >
                          <option value="">— Pilih item —</option>
                          {items.map((i) => (
                            <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                          ))}
                        </Select>
                      </Field>
                    </div>

                    {kind === "adjustment" ? (
                      <>
                        <div className="sm:col-span-4">
                          <Field label="Lokasi" required>
                            <Select value={l.locationId} onChange={(e) => setLine(l.key, { locationId: e.target.value })}>
                              <option value="">— Pilih —</option>
                              {locations.map((loc) => (
                                <option key={loc.id} value={loc.id}>{loc.warehouseCode} / {loc.code}</option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                        <div className="sm:col-span-3">
                          <Field label="Stok fisik sebenarnya" required>
                            <Input type="number" step="0.0001" min="0" value={l.newQty} onChange={(e) => setLine(l.key, { newQty: e.target.value })} />
                          </Field>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="sm:col-span-2">
                          <Field label="Kuantitas" required>
                            <Input type="number" step="0.0001" min="0.0001" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} />
                          </Field>
                        </div>
                        <div className="sm:col-span-2">
                          <Field label="Satuan">
                            <Select value={l.uomId} onChange={(e) => setLine(l.key, { uomId: e.target.value })}>
                              <option value="">base</option>
                              {uoms.map((u) => (
                                <option key={u.id} value={u.id}>{u.code}</option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                        {kind === "receipt" || kind === "opening" ? (
                          <div className="sm:col-span-3">
                            <Field label="Biaya satuan (opsional)">
                              <Input type="number" step="0.000001" min="0" value={l.unitCost} onChange={(e) => setLine(l.key, { unitCost: e.target.value })} placeholder="0 = biaya nol" />
                            </Field>
                          </div>
                        ) : null}
                        {kind === "issue" ? (
                          <div className="sm:col-span-3 flex items-end">
                            <p className="text-xs text-slate-400">Sumber: lokasi header</p>
                          </div>
                        ) : null}
                      </>
                    )}

                    <div className="flex items-end sm:col-span-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
                        disabled={lines.length <= 1}
                      >
                        Hapus
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="sm" type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
                + Tambah baris
              </Button>
            </div>

            <Field label="Catatan">
              <Textarea value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} />
            </Field>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" type="button" onClick={() => setOpenKind(null)}>Batal</Button>
              <Button
                variant="secondary"
                type="button"
                loading={loading}
                onClick={() => submit("draft")}
              >
                Simpan Draft
              </Button>
              <Button type="button" loading={loading} onClick={() => submit("post")} disabled={!canPost}>
                Posting Langsung
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              Draft tidak mengubah stok. Stok berubah hanya saat posting, dengan validasi ketersediaan
              pada saat itu juga.
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
