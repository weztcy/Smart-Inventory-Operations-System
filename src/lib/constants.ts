// Enumerasi domain — SQLite tidak mendukung enum Prisma, jadi semua nilai
// string divalidasi terhadap konstanta ini di lapisan aplikasi.

// ---------- Peran & izin (PRD §4) ----------
export const ROLES = ["OWNER", "MANAGER", "WAREHOUSE", "PRODUCTION", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  MANAGER: "Operations Manager",
  WAREHOUSE: "Warehouse Staff",
  PRODUCTION: "Production Staff",
  VIEWER: "Viewer / Auditor",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: "Akses penuh termasuk pengaturan organisasi, anggota, dan langganan.",
  MANAGER: "Mengelola master data, seluruh transaksi stok, pembelian, produksi, dan laporan.",
  WAREHOUSE: "Membuat dan memproses transaksi stok serta stock opname.",
  PRODUCTION: "Mencatat konsumsi material, hasil produksi, dan scrap.",
  VIEWER: "Hanya melihat laporan, transaksi, dan audit trail.",
};

export const PERMISSIONS = [
  "item.view",
  "item.manage",
  "master.manage",
  "tx.view",
  "tx.create",
  "tx.post",
  "tx.approve",
  "tx.reverse",
  "po.view",
  "po.manage",
  "bom.view",
  "bom.manage",
  "production.view",
  "production.manage",
  "scrap.view",
  "scrap.manage",
  "opname.manage",
  "report.view",
  "report.export",
  "audit.view",
  "import.manage",
  "member.manage",
  "billing.manage",
  "settings.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, Permission[]> = {
  OWNER: [...PERMISSIONS],
  MANAGER: [
    "item.view", "item.manage", "master.manage",
    "tx.view", "tx.create", "tx.post", "tx.approve", "tx.reverse",
    "po.view", "po.manage",
    "bom.view", "bom.manage",
    "production.view", "production.manage",
    "scrap.view", "scrap.manage",
    "opname.manage",
    "report.view", "report.export",
    "audit.view", "import.manage",
  ],
  WAREHOUSE: [
    "item.view", "tx.view", "tx.create", "tx.post",
    "po.view", "opname.manage", "scrap.view",
    "report.view",
  ],
  PRODUCTION: [
    "item.view", "tx.view",
    "bom.view", "production.view", "production.manage",
    "scrap.view", "scrap.manage",
    "report.view",
  ],
  VIEWER: [
    "item.view", "tx.view", "po.view", "bom.view", "production.view",
    "scrap.view", "report.view", "report.export", "audit.view",
  ],
};

export function roleHas(role: string, permission: Permission): boolean {
  const list = MATRIX[role as Role];
  return !!list && list.includes(permission);
}

// ---------- Status organisasi & langganan ----------
export const ORG_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export const SUBSCRIPTION_STATUSES = [
  "TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

// Langganan dengan status ini memblokir transaksi operasional baru.
export const BLOCKING_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "SUSPENDED", "CANCELLED", "EXPIRED",
];

// ---------- Master data ----------
export const ITEM_TYPES = [
  "RAW_MATERIAL", "WIP", "FINISHED_GOODS", "CONSUMABLE", "RESALE", "SCRAP",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  RAW_MATERIAL: "Bahan Baku",
  WIP: "Barang Dalam Proses",
  FINISHED_GOODS: "Barang Jadi",
  CONSUMABLE: "Habis Pakai",
  RESALE: "Barang Dagangan",
  SCRAP: "Scrap / Sisa Material",
};

export const LOCATION_TYPES = ["RAW", "CUTTING", "FINISHED", "SCRAP", "GENERAL"] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];
export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  RAW: "Bahan Baku",
  CUTTING: "Area Cutting",
  FINISHED: "Barang Jadi",
  SCRAP: "Penyimpanan Scrap",
  GENERAL: "Umum",
};

// Satuan standar yang dibuat otomatis untuk organisasi baru.
export const DEFAULT_UOMS: { code: string; name: string }[] = [
  { code: "pcs", name: "Piece" },
  { code: "kg", name: "Kilogram" },
  { code: "g", name: "Gram" },
  { code: "m", name: "Meter" },
  { code: "cm", name: "Centimeter" },
  { code: "l", name: "Liter" },
  { code: "ml", name: "Milliliter" },
  { code: "sheet", name: "Sheet" },
  { code: "roll", name: "Roll" },
  { code: "box", name: "Box" },
];

// Konversi standar (1 fromUom = factor toUom).
export const DEFAULT_UOM_CONVERSIONS: { from: string; to: string; factor: string }[] = [
  { from: "kg", to: "g", factor: "1000" },
  { from: "m", to: "cm", factor: "100" },
  { from: "l", to: "ml", factor: "1000" },
];

// ---------- Transaksi inventori ----------
export const TX_TYPES = [
  "OPENING", "RECEIPT", "ISSUE", "TRANSFER", "ADJUSTMENT",
  "CONSUMPTION", "OUTPUT", "SCRAP_IN", "DISPOSAL", "REVERSAL",
] as const;
export type TxType = (typeof TX_TYPES)[number];

export const TX_TYPE_LABELS: Record<TxType, string> = {
  OPENING: "Saldo Awal",
  RECEIPT: "Penerimaan Barang",
  ISSUE: "Pengeluaran Barang",
  TRANSFER: "Transfer Internal",
  ADJUSTMENT: "Penyesuaian Stok",
  CONSUMPTION: "Konsumsi Produksi",
  OUTPUT: "Hasil Produksi",
  SCRAP_IN: "Scrap Masuk",
  DISPOSAL: "Pembuangan",
  REVERSAL: "Reversal",
};

export const TX_STATUSES = ["DRAFT", "POSTED", "CANCELLED", "REVERSED"] as const;
export type TxStatus = (typeof TX_STATUSES)[number];

export const TX_PREFIXES: Record<TxType, string> = {
  OPENING: "OPN",
  RECEIPT: "RCV",
  ISSUE: "ISS",
  TRANSFER: "TRF",
  ADJUSTMENT: "ADJ",
  CONSUMPTION: "CON",
  OUTPUT: "OUT",
  SCRAP_IN: "SCR",
  DISPOSAL: "DSP",
  REVERSAL: "REV",
};

// Jenis pengeluaran (PRD §10.1) — disimpan pada kolom reason transaksi ISSUE.
export const ISSUE_TYPES = [
  "INTERNAL_USE", "PRODUCTION", "SALE", "RETURN_TO_SUPPLIER", "DISPOSAL", "OTHER",
] as const;
export const ISSUE_TYPE_LABELS: Record<(typeof ISSUE_TYPES)[number], string> = {
  INTERNAL_USE: "Penggunaan Internal",
  PRODUCTION: "Pemakaian Produksi",
  SALE: "Pengiriman ke Customer",
  RETURN_TO_SUPPLIER: "Pengembalian ke Supplier",
  DISPOSAL: "Pembuangan",
  OTHER: "Lainnya",
};

// ---------- Purchase order ----------
export const PO_STATUSES = [
  "DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED",
] as const;
export type POStatus = (typeof PO_STATUSES)[number];

// ---------- BOM & produksi ----------
export const BOM_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export const PRODUCTION_STATUSES = [
  "DRAFT", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED",
] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];
export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Dikonfirmasi",
  IN_PROGRESS: "Berlangsung",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

// ---------- Scrap ----------
export const SCRAP_CATEGORIES = ["REUSABLE", "SALEABLE", "DISPOSAL", "PENDING"] as const;
export type ScrapCategory = (typeof SCRAP_CATEGORIES)[number];
export const SCRAP_CATEGORY_LABELS: Record<ScrapCategory, string> = {
  REUSABLE: "Reusable (dipakai ulang)",
  SALEABLE: "Saleable (dijual)",
  DISPOSAL: "Disposal (dibuang)",
  PENDING: "Pending Assessment",
};

// ---------- Stock opname ----------
export const STOCK_COUNT_STATUSES = [
  "DRAFT", "IN_PROGRESS", "SUBMITTED", "RECONCILED", "CANCELLED",
] as const;

// ---------- Lainnya ----------
export const ALERT_TYPES = ["LOW_STOCK", "UNCATEGORIZED_SCRAP", "PO_LATE"] as const;
export const IMPORT_TYPES = ["ITEMS", "OPENING_STOCK"] as const;

export const PLAN_CODES = ["FREE", "PRO", "BUSINESS"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const DEFAULT_PLANS: {
  code: PlanCode;
  name: string;
  description: string;
  priceMonthly: number;
  maxItems: number | null;
  maxUsers: number | null;
  maxWarehouses: number | null;
  sortOrder: number;
}[] = [
  {
    code: "FREE", name: "Free", priceMonthly: 0,
    description: "Untuk mencoba fitur inti: 100 item, 3 pengguna, 1 gudang.",
    maxItems: 100, maxUsers: 3, maxWarehouses: 1, sortOrder: 1,
  },
  {
    code: "PRO", name: "Pro", priceMonthly: 149000,
    description: "Multi-gudang, tracking produksi, analitik scrap, laporan lanjutan.",
    maxItems: 5000, maxUsers: 25, maxWarehouses: 10, sortOrder: 2,
  },
  {
    code: "BUSINESS", name: "Business", priceMonthly: 449000,
    description: "Tanpa batas item & gudang, lebih banyak pengguna, dukungan prioritas.",
    maxItems: null, maxUsers: null, maxWarehouses: null, sortOrder: 3,
  },
];
