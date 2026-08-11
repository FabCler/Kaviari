/** Plain serializable shapes passed from server pages to client components. */

export interface PoLineDto {
  id: string;
  productId: string;
  productName: string;
  tinSizeGrams: number;
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
  lines: PoLineDto[];
}

export interface ProductOptionDto {
  id: string;
  name: string;
  tinSizeGrams: number;
  unitCost: number;
}
