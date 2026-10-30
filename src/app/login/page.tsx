import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Masuk" };

export default async function LoginPage() {
  const ctx = await getSessionContext();
  if (ctx) redirect("/dashboard");
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">S</div>
            <span className="font-semibold text-slate-900">Smart Inventory</span>
          </Link>
          <h1 className="mt-5 text-xl font-semibold text-slate-900">Masuk ke akun Anda</h1>
          <p className="mt-1 text-sm text-slate-500">Akses dashboard operasional organisasi Anda.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
