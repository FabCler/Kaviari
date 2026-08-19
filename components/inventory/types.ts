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
  /** Units consumed over the last 30 days (demand movements, positive). */
  consumed30dUnits: number;
  /** Team forecast per upcoming month (index 0 = next month), 3 entries. */
  forecastMonths: number[];
  aduUnitsPerDay: number;
  aduIsOverride: boolean;
  aduOverrideUnitsPerDay: number | null;
  weeksOfCover: number | null;
  stockValue: number;
}
