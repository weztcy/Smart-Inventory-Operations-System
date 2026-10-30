import { requirePermission } from "@/lib/auth";
import { ImportClient } from "@/components/import-client";
import { PageHeader } from "@/components/ui";
import { ITEM_TEMPLATE_HEADER, OPENING_TEMPLATE_HEADER } from "@/lib/services/importCsv";

export const metadata = { title: "Import CSV" };

export default async function ImportPage() {
  await requirePermission("import.manage");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Import CSV"
        description="Item dan saldo awal. Saldo awal diproses sebagai transaksi opening balance — bukan pengubahan angka stok langsung."
      />
      <ImportClient templates={{ items: ITEM_TEMPLATE_HEADER, opening: OPENING_TEMPLATE_HEADER }} />
    </div>
  );
}
