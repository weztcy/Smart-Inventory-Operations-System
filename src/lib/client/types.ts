// Tipe opsi ringan yang dikirim dari server component ke komponen klien.
export interface ItemOption {
  id: string;
  code: string;
  name: string;
  uomId: string;
  uomCode: string;
  avgCost: string;
}
export interface LocationOption {
  id: string;
  code: string;
  name: string;
  warehouseCode: string;
}
export interface SupplierOption {
  id: string;
  name: string;
}
export interface CategoryOption {
  id: string;
  name: string;
}
export interface UomOption {
  id: string;
  code: string;
  name: string;
}
export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}
