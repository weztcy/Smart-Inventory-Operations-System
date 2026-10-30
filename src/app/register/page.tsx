import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { RegisterForm } from "@/components/auth-forms";

export const metadata = { title: "Daftar" };

export default async function RegisterPage() {
  const ctx = await getSessionContext();
  if (ctx) redirect("/dashboard");
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">S</div>
            <span className="font-semibold text-slate-900">Smart Inventory</span>
          </Link>
          <h1 className="mt-5 text-xl font-semibold text-slate-900">Buat organisasi baru</h1>
          <p className="mt-1 text-sm text-slate-500">
            Anda menjadi owner dengan paket Free. Gudang, lokasi, dan satuan dasar disiapkan otomatis.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <RegisterForm />
        </div>
      </div>
    </div>
  );
}
