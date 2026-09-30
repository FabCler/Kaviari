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
  /** Units consumed in the current calendar month (demand movements, positive). */
  consumedThisMonthUnits: number;
  /** Units consumed in the previous calendar month. */
  consumedPrevMonthUnits: number;
  /** Units consumed over the rolling last 30 days. */
  consumed30dUnits: number;
  /** Team forecast per upcoming month (index 0 = next month), 3 entries. */
  forecastMonths: number[];
  aduUnitsPerDay: number;
  aduIsOverride: boolean;
  aduOverrideUnitsPerDay: number | null;
  weeksOfCover: number | null;
  stockValue: number;
}
