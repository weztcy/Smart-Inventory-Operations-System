import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: {
    default: "Smart Inventory & Operations",
    template: "%s | Smart Inventory",
  },
  description:
    "SaaS manajemen persediaan, produksi, dan material sisa untuk UMKM manufaktur, bengkel, dan gudang.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
