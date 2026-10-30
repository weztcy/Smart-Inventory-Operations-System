"use client";

import Link from "next/link";
import { useState } from "react";

// Data Fitur Inti SaaS
const CORE_FEATURES = [
  {
    title: "ACID Inventory Engine",
    badge: "Anti Stok Minus",
    desc: "Setiap mutasi stok melewati database transaction dengan locking mutex. Sistem secara ketat menolak pengeluaran jika saldo fisik di lokasi tidak mencukupi.",
    icon: (
      <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
  {
    title: "Moving Weighted Average",
    badge: "Valuasi Finansial",
    desc: "Biaya pokok rata-rata tertimbang (MAC) dihitung otomatis secara instan pada setiap penerimaan barang, menghilangkan distorsi nilai pada laporan keuangan.",
    icon: (
      <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  {
    title: "Multi-Gudang & Pemetaan Lokasi",
    badge: "Presisi Lokasi",
    desc: "Kelola banyak gudang dengan pemetaan lokasi spesifik: Bahan Baku (RAW), Cutting, Barang Jadi (FINISHED), hingga Tempat Penyimpanan Scrap.",
    icon: (
      <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 21 19.5-.001M3.75 21V6.75A2.25 2.25 0 0 1 6 4.5h12a2.25 2.25 0 0 1 2.25 2.25V21M9 10.5h6M9 15h6M9 6h6" />
      </svg>
    ),
  },
  {
    title: "Bill of Materials & Work Orders",
    badge: "Manufaktur Terpadu",
    desc: "Definisikan resep produksi bertingkat dengan toleransi scrap. Konfirmasi pesanan kerja otomatis mereservasi bahan baku agar tidak terpakai proyek lain.",
    icon: (
      <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
      </svg>
    ),
  },
  {
    title: "Closed-Loop Scrap Management",
    badge: "Anti Kebocoran",
    desc: "Lacak potongan plat, gram bubut, dan sisa cutting. Klasifikasikan sebagai Reusable (kembali ke produksi), Saleable (dijual), atau Disposal tanpa double-count.",
    icon: (
      <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
  },
  {
    title: "Stock Opname & Rekonsiliasi",
    badge: "1-Klik Koreksi",
    desc: "Bekukan snapshot baseline stok sistem saat opname dimulai, input hitungan fisik lapangan, dan terapkan jurnal penyesuaian (Adjustment) secara otomatis.",
    icon: (
      <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25" />
      </svg>
    ),
  },
];

// Pertanyaan yang Sering Diajukan (FAQ)
const FAQS = [
  {
    q: "Mengapa sistem ini menjamin stok tidak akan pernah minus?",
    a: "Tidak seperti software inventori sederhana berbasis CRUD langsung, Smart Inventory & Operations memproses seluruh mutasi melalui Atomic Inventory Engine. Setiap pengeluaran barang memvalidasi ketersediaan saldo fisik di bin/lokasi tujuan dalam database transaction yang terlindungi mutex serialisasi. Jika saldo tidak cukup, transaksi langsung dibatalkan secara aman.",
  },
  {
    q: "Bagaimana sistem menghitung valuasi persediaan?",
    a: "Aplikasi menerapkan standar Moving Weighted Average Cost (MAC) dengan pustaka aritmatika presisi tinggi (decimal.js, hingga 34 digit). Setiap kali ada barang masuk (Receipt / Saldo Awal) dengan harga berbeda, rata-rata biaya per unit langsung disesuaikan secara real-time.",
  },
  {
    q: "Apakah saya bisa mencoba sistem secara gratis tanpa kartu kredit?",
    a: "Ya! Anda dapat langsung membuat organisasi baru dengan Paket Free tanpa perlu memasukkan kartu kredit. Anda juga dapat login langsung menggunakan akun demo publik yang sudah terisi data operasional manufaktur.",
  },
  {
    q: "Bagaimana cara kerja pencatatan scrap / material sisa produksi?",
    a: "Saat proses pemotongan (cutting) atau perakitan menghasilkan material sisa, sistem mencatatnya sebagai item tipe SCRAP tanpa mengurangi konsumsi bahan baku dua kali. Scrap tersebut dapat diklasifikasikan sebagai Reusable (dapat dipakai proyek lain), Saleable (dijual ke pengepul), atau Disposal.",
  },
  {
    q: "Apakah saya bisa mengatur hak akses berbeda untuk staf gudang dan operator produksi?",
    a: "Sangat bisa. Sistem memiliki 5 peran bawaan (Owner, Operations Manager, Warehouse Staff, Production Staff, dan Viewer/Auditor) dengan matriks perizinan yang ketat. Staf gudang tidak dapat mengubah data keuangan perusahaan, dan operator hanya fokus pada pesanan kerja mereka.",
  },
  {
    q: "Dapatkah data master item dan saldo awal diimpor dari file Excel / CSV?",
    a: "Ya. Tersedia modul Import CSV bawaan dengan fitur validasi sebelum commit, sehingga Anda dapat memigrasikan ratusan SKU dan saldo awal dari sistem lama dalam hitungan menit.",
  },
];

export default function LandingPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annually">("annually");
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [activeTabPreview, setActiveTabPreview] = useState<"stok" | "produksi" | "ledger">("stok");
  const [copiedDemo, setCopiedDemo] = useState(false);

  const copyDemoCreds = () => {
    navigator.clipboard.writeText("demo@demo.com / demo1234");
    setCopiedDemo(true);
    setTimeout(() => setCopiedDemo(false), 2500);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 selection:bg-indigo-500 selection:text-white">
      {/* 1. Header & Navigation */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white shadow-sm shadow-indigo-200">
              S
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-slate-900">Smart Inventory</span>
              <span className="-mt-1 text-[10px] font-medium tracking-wide text-indigo-600 uppercase">Operations SaaS</span>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#fitur" className="hover:text-indigo-600 transition">Fitur Unggulan</a>
            <a href="#solusi" className="hover:text-indigo-600 transition">Solusi Industri</a>
            <a href="#cara-kerja" className="hover:text-indigo-600 transition">Cara Kerja</a>
            <a href="#harga" className="hover:text-indigo-600 transition">Harga &amp; Paket</a>
            <a href="#faq" className="hover:text-indigo-600 transition">FAQ</a>
          </nav>

          <div className="flex items-center gap-2.5 text-sm">
            <Link
              href="/login"
              className="rounded-lg px-3.5 py-2 font-medium text-slate-700 hover:bg-slate-100 transition"
            >
              Masuk
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700 transition"
            >
              Mulai Gratis
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* 2. Hero Section */}
        <section className="relative overflow-hidden bg-white pb-20 pt-14 lg:pb-28 lg:pt-20">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(45rem_35rem_at_top,theme(colors.indigo.50),white)] opacity-70" />
          
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
            <div className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-indigo-200/80 bg-indigo-50/70 px-3.5 py-1 text-xs font-semibold text-indigo-700 shadow-2xs backdrop-blur-xs">
              <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
              <span>Platform SaaS Inventori &amp; Operasi Manufaktur Modern</span>
            </div>

            <h1 className="mx-auto max-w-4xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Hentikan Selisih Stok &amp; Kebocoran Material dengan{" "}
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                ACID Inventory Engine
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Bukan sekadar pencatatan CRUD biasa. Smart Inventory &amp; Operations mengunci saldo dari stok negatif,
              menghitung valuasi moving average otomatis, mengelola pesanan kerja (BOM), dan mencatat scrap sisa material
              hingga ke dokumen sumbernya.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="w-full sm:w-auto rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 hover:shadow-lg transition"
              >
                Buat Organisasi Gratis (100% Free)
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
              >
                <span>Eksplor Akun Demo</span>
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700">Demo</span>
              </Link>
            </div>

            {/* Quick Demo Credentials Tip */}
            <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-lg bg-slate-100/90 px-3 py-1.5 text-xs text-slate-600 border border-slate-200">
              <span className="font-semibold text-slate-800">Login Demo Instan:</span>
              <code className="font-mono text-indigo-700">demo@demo.com</code> / <code className="font-mono text-indigo-700">demo1234</code>
              <button
                onClick={copyDemoCreds}
                className="ml-1 text-slate-500 hover:text-indigo-600 underline font-medium cursor-pointer"
              >
                {copiedDemo ? "Tersalin!" : "Salin"}
              </button>
            </div>

            {/* Trust Highlights */}
            <div className="mt-14 grid grid-cols-2 gap-4 border-y border-slate-100 py-6 text-left sm:grid-cols-4">
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-slate-900">0%</span>
                <span className="text-xs text-slate-500">Toleransi Stok Negatif</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-slate-900">34-Digit</span>
                <span className="text-xs text-slate-500">Presisi Desimal Valuasi</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-slate-900">Closed-Loop</span>
                <span className="text-xs text-slate-500">Pelacakan Scrap &amp; Waste</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-slate-900">100% Audit</span>
                <span className="text-xs text-slate-500">Ledger Pergerakan Permanen</span>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Interactive Product Sneak Peek (Mock UI) */}
        <section className="border-b border-slate-200 bg-slate-100/70 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600">Antarmuka Bersih &amp; Terstruktur</h2>
              <p className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Dibangun Khusus untuk Alur Kerja Operasional Nyata</p>
            </div>

            {/* Window Shell Mock */}
            <div className="mt-10 overflow-hidden rounded-2xl border border-slate-300/80 bg-white shadow-xl shadow-slate-200/60">
              {/* Window Header */}
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-rose-400" />
                  <div className="h-3 w-3 rounded-full bg-amber-400" />
                  <div className="h-3 w-3 rounded-full bg-emerald-400" />
                  <span className="ml-3 hidden text-xs font-mono text-slate-400 sm:inline">
                    https://app.smartinventory.io/stok
                  </span>
                </div>
                {/* Tab Switcher */}
                <div className="flex rounded-lg bg-slate-200/70 p-1 text-xs font-medium text-slate-600">
                  <button
                    onClick={() => setActiveTabPreview("stok")}
                    className={`rounded-md px-3 py-1 transition cursor-pointer ${
                      activeTabPreview === "stok" ? "bg-white font-semibold text-slate-900 shadow-xs" : "hover:text-slate-900"
                    }`}
                  >
                    Posisi Stok Real-Time
                  </button>
                  <button
                    onClick={() => setActiveTabPreview("produksi")}
                    className={`rounded-md px-3 py-1 transition cursor-pointer ${
                      activeTabPreview === "produksi" ? "bg-white font-semibold text-slate-900 shadow-xs" : "hover:text-slate-900"
                    }`}
                  >
                    Work Order &amp; BOM
                  </button>
                  <button
                    onClick={() => setActiveTabPreview("ledger")}
                    className={`rounded-md px-3 py-1 transition cursor-pointer ${
                      activeTabPreview === "ledger" ? "bg-white font-semibold text-slate-900 shadow-xs" : "hover:text-slate-900"
                    }`}
                  >
                    Kartu Stok Ledger
                  </button>
                </div>
              </div>

              {/* Window Body Mock */}
              <div className="p-5 sm:p-7">
                {activeTabPreview === "stok" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                        <span className="text-xs text-slate-500">Total Valuasi Fisik</span>
                        <p className="mt-1 text-lg font-bold text-slate-900">Rp 1.482.950.000</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                        <span className="text-xs text-slate-500">Total SKU Aktif</span>
                        <p className="mt-1 text-lg font-bold text-indigo-600">32 Item</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                        <span className="text-xs text-slate-500">Item Di Bawah Minimum</span>
                        <p className="mt-1 text-lg font-bold text-amber-600">2 Perlu Restock</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                        <span className="text-xs text-slate-500">Scrap Terkelola</span>
                        <p className="mt-1 text-lg font-bold text-emerald-600">119,5 kg Terlacak</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-200 text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3 font-semibold">SKU</th>
                            <th className="py-2.5 px-3 font-semibold">Nama Item</th>
                            <th className="py-2.5 px-3 font-semibold">Kategori</th>
                            <th className="py-2.5 px-3 font-semibold text-right">On Hand</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Tercadang</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Avg Cost</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Total Nilai</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          <tr>
                            <td className="py-2 px-3 font-mono font-semibold text-indigo-700">RM-PLAT-3MM</td>
                            <td className="py-2 px-3">Plat Baja SS400 3.0mm</td>
                            <td className="py-2 px-3">Baja &amp; Logam</td>
                            <td className="py-2 px-3 text-right font-medium">3.570,0 kg</td>
                            <td className="py-2 px-3 text-right text-amber-600">0,0 kg</td>
                            <td className="py-2 px-3 text-right">Rp 51.647</td>
                            <td className="py-2 px-3 text-right font-semibold">Rp 184.380.000</td>
                          </tr>
                          <tr className="bg-slate-50/40">
                            <td className="py-2 px-3 font-mono font-semibold text-indigo-700">RM-PLAT-5MM</td>
                            <td className="py-2 px-3">Plat Baja SS400 5.0mm</td>
                            <td className="py-2 px-3">Baja &amp; Logam</td>
                            <td className="py-2 px-3 text-right font-medium">1.762,0 kg</td>
                            <td className="py-2 px-3 text-right text-amber-600">145,6 kg</td>
                            <td className="py-2 px-3 text-right">Rp 77.521</td>
                            <td className="py-2 px-3 text-right font-semibold">Rp 136.592.000</td>
                          </tr>
                          <tr>
                            <td className="py-2 px-3 font-mono font-semibold text-indigo-700">FG-MEJA-WS</td>
                            <td className="py-2 px-3">Meja Kerja Workshop 200x100cm</td>
                            <td className="py-2 px-3">Barang Jadi</td>
                            <td className="py-2 px-3 text-right font-medium text-emerald-700">23 unit</td>
                            <td className="py-2 px-3 text-right">0 unit</td>
                            <td className="py-2 px-3 text-right">Rp 1.832.000</td>
                            <td className="py-2 px-3 text-right font-semibold">Rp 42.136.000</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTabPreview === "produksi" && (
                  <div className="space-y-4 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div>
                        <span className="font-mono text-sm font-bold text-indigo-700">MO-2026-000003</span>
                        <p className="text-slate-500">Produk: FG-TROLI-MAT — Troli Material Dorong 500kg</p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        IN_PROGRESS (Reservasi Terkunci)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                        <span className="text-slate-500">Rencana Output:</span>
                        <p className="font-semibold text-slate-900">10 Unit</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                        <span className="text-slate-500">Output Selesai:</span>
                        <p className="font-semibold text-emerald-600">4 Unit (QC Passed)</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                        <span className="text-slate-500">Gudang Bahan:</span>
                        <p className="font-semibold text-slate-900">WH-01 (Cikarang)</p>
                      </div>
                    </div>
                    <p className="text-slate-500 italic">
                      *Bahan baku sebanyak 180 kg Plat 2mm dan 45 m Pipa 2" telah direservasi agar tidak bisa dikeluarkan oleh transaksi lain.
                    </p>
                  </div>
                )}

                {activeTabPreview === "ledger" && (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">Jejak Ledger Transaksi (Append-Only)</span>
                      <span className="text-slate-400">Terbaca dari ledgerEntry table</span>
                    </div>
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between p-2.5 bg-slate-50/60">
                        <div>
                          <span className="font-mono font-bold text-indigo-700">RCV-2026-000002</span>
                          <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800">RECEIPT</span>
                          <p className="text-slate-500">Penerimaan PO-002: Baut M10x30 (3.000 pcs @ Rp 1.550)</p>
                        </div>
                        <span className="font-semibold text-emerald-600">+3.000,0 pcs</span>
                      </div>
                      <div className="flex items-center justify-between p-2.5">
                        <div>
                          <span className="font-mono font-bold text-indigo-700">CON-2026-000001</span>
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">CONSUMPTION</span>
                          <p className="text-slate-500">Konsumsi Produksi MO-001: Plat Baja 5mm untuk Meja Workshop</p>
                        </div>
                        <span className="font-semibold text-rose-600">-288,0 kg</span>
                      </div>
                      <div className="flex items-center justify-between p-2.5 bg-slate-50/60">
                        <div>
                          <span className="font-mono font-bold text-indigo-700">TRF-2026-000001</span>
                          <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 font-bold text-indigo-800">TRANSFER</span>
                          <p className="text-slate-500">Mutasi Antar-Gudang: WH-01 Cikarang &rarr; WH-02 Cakung</p>
                        </div>
                        <span className="font-semibold text-slate-700">Saldo Netral (Rp Sama)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 4. Problem & Solution Comparison */}
        <section id="solusi" className="bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600">Perbandingan Solusi</h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Mengapa Spreadsheet &amp; Software Kasir Tradisional Gagal di Bengkel Manufaktur?
              </p>
              <p className="mt-4 text-base text-slate-600">
                Bisnis berbasis fabrikasi fisik dan perakitan membutuhkan integrasi antara pembelian, resep bahan baku,
                dan pemanfaatan sisa produksi yang tidak dapat diselesaikan oleh CRUD biasa.
              </p>
            </div>

            <div className="mt-14 grid gap-8 md:grid-cols-2">
              {/* Sisi Masalah */}
              <div className="rounded-2xl border border-red-200 bg-red-50/30 p-7">
                <div className="flex items-center gap-2 text-red-700">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <h3 className="text-lg font-bold text-slate-900">Spreadsheet &amp; Aplikasi Kasir Biasa</h3>
                </div>
                <ul className="mt-5 space-y-3.5 text-sm text-slate-600">
                  <li className="flex items-start gap-2.5">
                    <span className="text-red-500 font-bold">✕</span>
                    <span><strong>Stok Minus:</strong> Data tertimpa begitu saja tanpa validasi ketersediaan riil di gudang.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="text-red-500 font-bold">✕</span>
                    <span><strong>Valuasi Kacau:</strong> Harga beli naik-turun membuat nilai aset gudang di neraca tidak akurat.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="text-red-500 font-bold">✕</span>
                    <span><strong>Scrap Menguap:</strong> Potongan plat, pipa sisa, dan offcut tidak tercatat dan berujung hilang/dicuri.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="text-red-500 font-bold">✕</span>
                    <span><strong>Ketiadaan Jejak Audit:</strong> Tidak ada yang tahu siapa yang mengedit baris stok jika ada selisih.</span>
                  </li>
                </ul>
              </div>

              {/* Sisi Solusi Smart Inventory */}
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-7 shadow-xs">
                <div className="flex items-center gap-2 text-indigo-700">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <h3 className="text-lg font-bold text-slate-900">Smart Inventory &amp; Operations</h3>
                </div>
                <ul className="mt-5 space-y-3.5 text-sm text-slate-700">
                  <li className="flex items-start gap-2.5">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span><strong>ACID Locked:</strong> Transaksi atomik menolak mutasi jika kuantitas lokasi tidak mencukupi.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span><strong>Moving Average Otomatis:</strong> Nilai barang keluar dan aset persediaan selalu akurat setiap detik.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span><strong>Closed-Loop Scrap:</strong> Sisa bahan cutting tercatat rapi untuk dipakai ulang atau dijual ke pengepul.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span><strong>Immutable Ledger:</strong> Dokumen transaksi permanen tidak bisa diedit sembarangan; koreksi via reversal.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Features Grid */}
        <section id="fitur" className="border-t border-slate-200 bg-slate-50 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600">Kapabilitas Komprehensif</h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Fitur Dirancang untuk Presisi Operasional Tanpa Celah
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {CORE_FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-indigo-300 hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 group-hover:bg-indigo-100 transition">
                      {f.icon}
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      {f.badge}
                    </span>
                  </div>
                  <h3 className="mt-5 text-base font-bold text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. How it Works (Workflow 4 Langkah) */}
        <section id="cara-kerja" className="bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600">Alur Kerja Sederhana</h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Hanya 4 Langkah dari Setup hingga Kendali Penuh
              </p>
            </div>

            <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative rounded-xl border border-slate-200 bg-slate-50/50 p-6">
                <span className="text-3xl font-extrabold text-indigo-200">01</span>
                <h4 className="mt-3 text-base font-bold text-slate-900">Setup Master &amp; Bin</h4>
                <p className="mt-2 text-sm text-slate-600">
                  Buat SKU, satuan (UoM), rasio konversi, gudang dan lokasi spesifik (RAW, CUT, FIN, SCR).
                </p>
              </div>
              <div className="relative rounded-xl border border-slate-200 bg-slate-50/50 p-6">
                <span className="text-3xl font-extrabold text-indigo-200">02</span>
                <h4 className="mt-3 text-base font-bold text-slate-900">PO &amp; Penerimaan</h4>
                <p className="mt-2 text-sm text-slate-600">
                  Terbitkan purchase order, lakukan penerimaan bertahap, dan biarkan sistem menghitung moving average.
                </p>
              </div>
              <div className="relative rounded-xl border border-slate-200 bg-slate-50/50 p-6">
                <span className="text-3xl font-extrabold text-indigo-200">03</span>
                <h4 className="mt-3 text-base font-bold text-slate-900">Work Order &amp; Scrap</h4>
                <p className="mt-2 text-sm text-slate-600">
                  Kunci alokasi bahan dengan reservasi otomatis. Catat konsumsi aktual, output produk, dan sisa scrap.
                </p>
              </div>
              <div className="relative rounded-xl border border-slate-200 bg-slate-50/50 p-6">
                <span className="text-3xl font-extrabold text-indigo-200">04</span>
                <h4 className="mt-3 text-base font-bold text-slate-900">Opname &amp; Rekonsiliasi</h4>
                <p className="mt-2 text-sm text-slate-600">
                  Hitung fisik berkala. Sistem otomatis menghitung selisih dan membuat jurnal penyesuaian tanpa ribet.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 7. PRICING SECTION (PAKET HARGA SAAS) */}
        <section id="harga" className="relative border-t border-slate-200 bg-slate-100/70 py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600">Harga Transparan &amp; Terjangkau</h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Pilih Paket yang Sesuai dengan Skala Bisnis Anda
              </p>
              <p className="mt-3 text-base text-slate-600">
                Mulai gratis untuk mencoba fitur inti, atau tingkatkan ke Pro &amp; Business untuk multi-gudang dan manufaktur tanpa batas.
              </p>

              {/* Billing Toggle */}
              <div className="mt-8 flex items-center justify-center gap-3">
                <span className={`text-sm font-medium ${billingCycle === "monthly" ? "text-slate-900 font-bold" : "text-slate-500"}`}>
                  Bulanan
                </span>
                <button
                  type="button"
                  onClick={() => setBillingCycle(billingCycle === "monthly" ? "annually" : "monthly")}
                  className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-indigo-600 transition-colors duration-200 ease-in-out focus:outline-hidden"
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      billingCycle === "annually" ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className={`text-sm font-medium ${billingCycle === "annually" ? "text-slate-900 font-bold" : "text-slate-500"}`}>
                  Tahunan <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">Hemat 20%</span>
                </span>
              </div>
            </div>

            {/* Pricing Cards Grid */}
            <div className="mt-14 grid gap-8 lg:grid-cols-3 lg:items-stretch">
              {/* Plan 1: Free */}
              <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-7 shadow-xs">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-900">Free</h3>
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Selamanya</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Untuk mencoba fitur inti inventori pada skala bengkel atau toko perintis.
                  </p>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-slate-900">Rp 0</span>
                    <span className="text-xs text-slate-400">/ bulan</span>
                  </div>

                  <div className="mt-6 space-y-2.5 border-t border-slate-100 pt-6 text-sm text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Maksimal <strong>100 Item SKU</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Maksimal <strong>3 Pengguna</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>1 Gudang Utama</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Transaksi Inbound &amp; Outbound Stok</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Kartu Stok &amp; Ledger Dasar</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Export Laporan ke CSV</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4">
                  <Link
                    href="/register"
                    className="block w-full rounded-xl border border-slate-300 bg-white py-2.5 text-center text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                  >
                    Daftar Akun Gratis
                  </Link>
                </div>
              </div>

              {/* Plan 2: Pro (Featured) */}
              <div className="relative flex flex-col justify-between rounded-2xl border-2 border-indigo-600 bg-white p-7 shadow-lg shadow-indigo-100">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-0.5 text-xs font-bold text-white shadow-xs">
                  PALING POPULER &amp; LENGKAP
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-900">Pro</h3>
                    <span className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">Rekomendasi</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Solusi lengkap untuk pabrik UMKM dan bengkel fabrikasi dengan lini produksi aktif.
                  </p>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-slate-900">
                      {billingCycle === "annually" ? "Rp 119.000" : "Rp 149.000"}
                    </span>
                    <span className="text-xs text-slate-400">/ bulan</span>
                  </div>
                  {billingCycle === "annually" && (
                    <p className="mt-1 text-[11px] text-emerald-600 font-medium">Ditagih tahunan (Hemat Rp 360.000/thn)</p>
                  )}

                  <div className="mt-6 space-y-2.5 border-t border-slate-100 pt-6 text-sm text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-600 font-bold">✓</span>
                      <span>Maksimal <strong>5.000 Item SKU</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-600 font-bold">✓</span>
                      <span>Maksimal <strong>25 Pengguna</strong> (Multi-Role)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-600 font-bold">✓</span>
                      <span>Hingga <strong>10 Gudang &amp; Bin Khusus</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-600 font-bold">✓</span>
                      <span><strong>BOM &amp; Work Orders Manufaktur</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-600 font-bold">✓</span>
                      <span><strong>Closed-Loop Scrap Management</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-600 font-bold">✓</span>
                      <span>Stock Opname &amp; Rekonsiliasi Otomatis</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-600 font-bold">✓</span>
                      <span>Moving Weighted Average Costing (MAC)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-600 font-bold">✓</span>
                      <span>Alert Stok Menipis &amp; PO Terlambat</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4">
                  <Link
                    href="/register"
                    className="block w-full rounded-xl bg-indigo-600 py-3 text-center text-sm font-semibold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 transition"
                  >
                    Pilih Paket Pro (Uji Coba 14 Hari)
                  </Link>
                </div>
              </div>

              {/* Plan 3: Business */}
              <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-7 shadow-xs">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-900">Business</h3>
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Enterprise</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Kapasitas tanpa batas untuk perusahaan manufaktur menengah dan distributor cabang banyak.
                  </p>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-slate-900">
                      {billingCycle === "annually" ? "Rp 359.000" : "Rp 449.000"}
                    </span>
                    <span className="text-xs text-slate-400">/ bulan</span>
                  </div>
                  {billingCycle === "annually" && (
                    <p className="mt-1 text-[11px] text-emerald-600 font-medium">Ditagih tahunan (Hemat Rp 1.080.000/thn)</p>
                  )}

                  <div className="mt-6 space-y-2.5 border-t border-slate-100 pt-6 text-sm text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Unlimited Item SKU</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Unlimited Pengguna Tim</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span><strong>Unlimited Gudang &amp; Cabang</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Semua fitur lengkap paket Pro</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Audit Trail &amp; Log Perubahan Permanen</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Import CSV Massal Tanpa Batas Baris</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Dukungan Prioritas &amp; Onboarding Tim</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4">
                  <Link
                    href="/register"
                    className="block w-full rounded-xl border border-slate-300 bg-white py-2.5 text-center text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                  >
                    Mulai Paket Business
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 8. Demo Accounts Direct Access Card */}
        <section className="bg-white py-14 border-b border-slate-200">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/80 p-6 sm:p-8 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div>
                  <span className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white uppercase tracking-wider">
                    Uji Coba Langsung
                  </span>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">Ingin Mencoba Langsung dengan Data Riil?</h3>
                  <p className="mt-1 text-sm text-slate-600 max-w-xl">
                    Database demo kami sudah diisi dengan 32 master item, 3 gudang industri, 5 pesanan pembelian,
                    resep BOM, pesanan kerja, dan transaksi ledger nyata.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono text-slate-600">
                    <span className="rounded bg-slate-100 px-2 py-1 border border-slate-200">Owner: demo@demo.com</span>
                    <span className="rounded bg-slate-100 px-2 py-1 border border-slate-200">Gudang: gudang@demo.com</span>
                    <span className="rounded bg-slate-100 px-2 py-1 border border-slate-200">Password: demo1234</span>
                  </div>
                </div>
                <div className="shrink-0">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 transition"
                  >
                    <span>Masuk ke Demo Sekarang</span>
                    <span>&rarr;</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 9. FAQ Section */}
        <section id="faq" className="bg-slate-50 py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="text-center">
              <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600">Pertanyaan Umum</h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Hal yang Sering Ditanyakan Calon Pengguna
              </p>
            </div>

            <div className="mt-12 space-y-3">
              {FAQS.map((faq, idx) => (
                <div
                  key={faq.q}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden transition"
                >
                  <button
                    onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                    className="flex w-full items-center justify-between p-5 text-left text-sm font-bold text-slate-900 hover:text-indigo-600 cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <span className="ml-4 shrink-0 text-slate-400">
                      {activeFaq === idx ? "−" : "+"}
                    </span>
                  </button>
                  {activeFaq === idx && (
                    <div className="border-t border-slate-100 px-5 pb-5 pt-3 text-sm leading-relaxed text-slate-600 bg-slate-50/50">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 10. Final Call to Action */}
        <section className="relative overflow-hidden bg-indigo-900 py-16 text-white sm:py-20">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom,theme(colors.indigo.700),theme(colors.indigo.950))]" />
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Tingkatkan Akurasi Persediaan &amp; Manufaktur Anda Hari Ini
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-indigo-200">
              Bergabunglah dengan pelaku industri dan bengkel yang telah beralih dari pencatatan manual ke sistem otomasi terintegrasi.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="w-full sm:w-auto rounded-xl bg-white px-7 py-3.5 text-sm font-bold text-indigo-900 shadow-lg hover:bg-slate-100 transition"
              >
                Daftar Organisasi Sekarang
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto rounded-xl border border-indigo-400/50 bg-indigo-800/40 px-7 py-3.5 text-sm font-semibold text-white hover:bg-indigo-800/80 transition"
              >
                Coba Akun Demo
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* 11. Footer */}
      <footer className="border-t border-slate-200 bg-white py-12 text-sm text-slate-500">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
                S
              </div>
              <span className="font-semibold text-slate-900">Smart Inventory &amp; Operations</span>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs text-slate-500">
              <a href="#fitur" className="hover:text-slate-900 transition">Fitur</a>
              <a href="#solusi" className="hover:text-slate-900 transition">Solusi</a>
              <a href="#harga" className="hover:text-slate-900 transition">Harga</a>
              <a href="#faq" className="hover:text-slate-900 transition">FAQ</a>
              <Link href="/login" className="hover:text-slate-900 transition">Masuk</Link>
              <Link href="/register" className="hover:text-slate-900 transition">Daftar</Link>
            </div>

            <p className="text-xs text-slate-400">
              &copy; {new Date().getFullYear()} Smart Inventory &amp; Operations SaaS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
