"use client";

// Import CSV: unggah → validasi (preview) → commit.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { Button, Field, Input } from "@/components/form";
import { useToast } from "@/components/toast";

interface ValidationResult {
  jobId: string;
  totalRows: number;
  validCount: number;
  errors: { row: number; message: string }[];
  canCommit: boolean;
}

export function ImportClient({ templates }: { templates: { items: string; opening: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<"items" | "opening">("items");
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const text = await file.text();
    setCsv(text);
  }

  async function validate() {
    setLoading(true);
    try {
      const r = await api<ValidationResult>("/api/import", {
        method: "POST",
        body: { type, fileName: fileName || "upload.csv", csv },
      });
      setResult(r);
      toast.push(
        r.canCommit
          ? `Validasi lolos: ${r.validCount} baris siap diimpor.`
          : `Validasi menemukan ${r.errors.length} baris bermasalah.`,
        r.canCommit ? "success" : "error",
      );
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Validasi gagal", "error");
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    if (!result) return;
    setCommitting(true);
    try {
      const r = await api<{ number?: string }>("/api/import?op=commit&type=" + type, {
        method: "POST",
        body: { jobId: result.jobId },
      });
      toast.push(
        type === "opening"
          ? `Saldo awal ${r.number} diposting sebagai transaksi terlacak.`
          : "Import item selesai.",
        "success",
      );
      setResult(null);
      setCsv(""); setFileName("");
      router.refresh();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Commit gagal", "error");
    } finally {
      setCommitting(false);
    }
  }

  const header = type === "items" ? templates.items : templates.opening;
  const example =
    type === "items"
      ? "STEEL-PLATE-3MM,Plat Baja 3mm,RAW_MATERIAL,kg,Steel,50,100,52000,Plat umum"
      : "STEEL-PLATE-3MM,WH-01-RAW,250,52000";

  function downloadTemplate() {
    const content = header + "\n" + example;
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = type === "items" ? "template-items.csv" : "template-opening-stock.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(["items", "opening"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setType(t); setResult(null); }}
            className={type === t
              ? "rounded-full bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white"
              : "rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}
          >
            {t === "items" ? "Import Item" : "Import Saldo Awal"}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">1. Unduh template</h3>
        <p className="mt-1 font-mono text-xs text-slate-500">{header}</p>
        <p className="mt-1 font-mono text-xs text-slate-400">contoh: {example}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={downloadTemplate}>
          Unduh Template CSV
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">2. Unggah & validasi</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="File CSV">
            <Input type="file" accept=".csv,text/csv" onChange={onFile} />
          </Field>
          <div className="flex items-end">
            <Button loading={loading} disabled={!csv} onClick={validate}>
              Validasi & Preview
            </Button>
          </div>
        </div>
      </div>

      {result ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">3. Hasil validasi</h3>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <span>Total baris: <strong>{result.totalRows}</strong></span>
            <span className="text-emerald-600">Valid: <strong>{result.validCount}</strong></span>
            <span className={result.errors.length ? "text-red-600" : ""}>
              Bermasalah: <strong>{result.errors.length}</strong>
            </span>
          </div>
          {result.errors.length > 0 ? (
            <div className="mt-3 max-h-60 overflow-y-auto rounded-lg bg-red-50 p-3 ring-1 ring-red-100">
              <ul className="space-y-1 text-xs text-red-700">
                {result.errors.map((e, i) => (
                  <li key={i}>Baris {e.row}: {e.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.canCommit ? (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {type === "opening"
                  ? "Saldo awal akan diposting sebagai transaksi OPENING yang dapat ditelusuri."
                  : "Item akan dibuat sesuai data tervalidasi."}
              </p>
              <Button variant="success" loading={committing} onClick={commit}>
                Konfirmasi & Import
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-amber-600">
              Perbaiki baris bermasalah lalu unggah ulang — import sebagian tidak diizinkan untuk
              menjaga konsistensi data.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
