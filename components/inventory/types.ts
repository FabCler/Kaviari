/** Serializable rows passed from the inventory server page to client components. */

export interface InventoryRow {
  productId: string;
  kaviariCode: string;
  name: string;
  shortName: string;
  grade: string | null;
  category: string;
  tinSizeGrams: number;
  unitCost: number;
  onHandTins: number;
  onHandGrams: number;
  onOrderTins: number;
  onOrderGrams: number;
  aduGramsPerDay: number;
  aduIsOverride: boolean;
  aduOverrideGramsPerDay: number | null;
  daysOfCover: number | null;
  stockValue: number;
}

export interface ExpiringLotRow {
  lotId: string;
  lotNumber: string;
  productId: string;
  productName: string;
  tinSizeGrams: number;
  quantityTins: number;
  /** ISO string */
  expiryDate: string;
  daysLeft: number;
}
