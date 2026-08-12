/** Plain serializable shapes passed from server pages to client components. */

export interface PoLineDto {
  id: string;
  productId: string;
  productName: string;
  prCode: string;
  unit: string;
  packingPerBox: number | null;
  quantityTins: number;
  unitCost: number;
}

export interface PoDto {
  id: string;
  reference: string;
  status: string;
  orderDate: string; // ISO
  expectedDeliveryDate: string; // ISO
  receivedDate: string | null; // ISO
  notes: string | null;
  uploadedFileName: string | null;
  lines: PoLineDto[];
}

export interface ProductOptionDto {
  id: string;
  prCode: string;
  name: string;
  unit: string;
  packingPerBox: number | null;
  unitCost: number;
}
