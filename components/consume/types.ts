/** Serializable props passed from the consume server page to the client flow. */

export interface ConsumableProduct {
  productId: string;
  name: string;
  shortName: string;
  caviarType: string | null;
  category: string;
  /** Stock-keeping unit: "Tin" | "PC" | "KG" | "PK". */
  unit: string;
  /** kg reference per unit (null for non-weighed items). */
  gramsPerUnit: number | null;
  onHandUnits: number;
  aduUnitsPerDay: number;
}

export interface RecentMovementRow {
  movementId: string;
  /** ISO string */
  date: string;
  productName: string;
  /** Absolute quantity in the product's unit. */
  units: number;
  unit: string;
  type: string;
  channel: string | null;
  lotNumber: string | null;
}
