"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { Button, Field, Input, Select } from "@/components/form";
import { useToast } from "@/components/toast";

export function LoginForm() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/auth/login", { method: "POST", body: { email, password } });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Login gagal", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email" required>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nama@perusahaan.com" />
      </Field>
      <Field label="Password" required>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
      </Field>
      <Button type="submit" loading={loading} className="w-full">Masuk</Button>
      <p className="text-center text-xs text-slate-500">
        Belum punya akun?{" "}
        <Link href="/register" className="font-medium text-indigo-600 hover:underline">Daftar organisasi baru</Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", password: "", orgName: "", businessType: "manufaktur",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/auth/register", { method: "POST", body: form });
      toast.push("Organisasi berhasil dibuat. Selamat bekerja!", "success");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Registrasi gagal", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama lengkap" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Budi Santoso" />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="budi@perusahaan.com" />
        </Field>
      </div>
      <Field label="Password" required hint="Minimal 8 karakter">
        <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama organisasi" required>
          <Input value={form.orgName} onChange={(e) => setForm({ ...form, orgName: e.target.value })} required placeholder="PT Contoh Manufaktur" />
        </Field>
        <Field label="Jenis bisnis">
          <Select value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })}>
            <option value="manufaktur">Manufaktur</option>
            <option value="bengkel">Bengkel / Workshop</option>
            <option value="gudang">Gudang / Distribusi</option>
            <option value="lainnya">Lainnya</option>
          </Select>
        </Field>
      </div>
      <Button type="submit" loading={loading} className="w-full">Buat Organisasi</Button>
      <p className="text-center text-xs text-slate-500">
        Zona waktu default Asia/Jakarta dan mata uang IDR — dapat diubah nanti di pengaturan.
      </p>
      <p className="text-center text-xs text-slate-500">
        Sudah punya akun? <Link href="/login" className="font-medium text-indigo-600 hover:underline">Masuk</Link>
      </p>
    </form>
  );
}

export function InviteClaimForm({ token, needAccount }: { token: string; needAccount: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/invitations/accept", {
        method: "POST",
        body: needAccount ? { token, name, password } : { token },
      });
      toast.push("Undangan diterima. Selamat bergabung!", "success");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Gagal menerima undangan", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {needAccount ? (
        <>
          <Field label="Nama lengkap" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Buat password" required hint="Minimal 8 karakter">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </Field>
        </>
      ) : null}
      <Button type="submit" loading={loading} className="w-full">Terima Undangan</Button>
    </form>
  );
}
