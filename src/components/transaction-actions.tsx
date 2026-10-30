"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { Button } from "@/components/form";
import { Modal } from "@/components/modal";
import { Field, Input } from "@/components/form";
import { useToast } from "@/components/toast";

export function PostButton({ txId, label = "Posting" }: { txId: string; label?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const r = await api<{ number: string }>(`/api/transactions/${txId}/post`, { method: "POST" });
          toast.push(`Transaksi ${r.number} diposting — stok diperbarui.`, "success");
          router.refresh();
        } catch (e) {
          toast.push(e instanceof Error ? e.message : "Gagal posting", "error");
        } finally {
          setLoading(false);
        }
      }}
    >
      {label}
    </Button>
  );
}

export function CancelDraftButton({ txId }: { txId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={loading}
      onClick={async () => {
        if (!confirm("Batalkan draft ini? Tindakan tidak dapat dibatalkan.")) return;
        setLoading(true);
        try {
          await api(`/api/transactions/${txId}/cancel`, { method: "POST" });
          toast.push("Draft dibatalkan.", "success");
          router.refresh();
        } catch (e) {
          toast.push(e instanceof Error ? e.message : "Gagal membatalkan", "error");
        } finally {
          setLoading(false);
        }
      }}
    >
      Batalkan Draft
    </Button>
  );
}

export function ReverseButton({ txId, number }: { txId: string; number: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        Reverse
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Reverse ${number}`}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Reversal membuat transaksi berlawanan yang mengembalikan efek stok dan nilai persediaan.
            Transaksi asal tetap utuh untuk audit. Reversal gagal bila stok tidak mencukupi.
          </p>
          <Field label="Alasan reversal">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. salah input kuantitas" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button
              variant="danger"
              loading={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  const r = await api<{ number: string }>(`/api/transactions/${txId}/reverse`, {
                    method: "POST",
                    body: { reason: reason || undefined },
                  });
                  toast.push(`Reversal ${r.number} dibuat. Transaksi asal berstatus REVERSED.`, "success");
                  setOpen(false);
                  router.refresh();
                } catch (e) {
                  toast.push(e instanceof Error ? e.message : "Gagal membuat reversal", "error");
                } finally {
                  setLoading(false);
                }
              }}
            >
              Buat Reversal
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
