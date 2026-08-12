/** Serializable rows passed from the inventory server page to client components. */

export interface InventoryRow {
  productId: string;
  prCode: string;
  name: string;
  shortName: string;
  caviarType: string | null;
  category: string;
  unit: string;
  gramsPerUnit: number | null;
  unitCost: number;
  onHandUnits: number;
  onOrderUnits: number;
  aduUnitsPerDay: number;
  aduIsOverride: boolean;
  aduOverrideUnitsPerDay: number | null;
  weeksOfCover: number | null;
  stockValue: number;
}

export interface ExpiringLotRow {
  lotId: string;
  lotNumber: string;
  productId: string;
  productName: string;
  unit: string;
  gramsPerUnit: number | null;
  quantityTins: number;
  /** ISO string */
  expiryDate: string;
  daysLeft: number;
}
