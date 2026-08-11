/** Serializable props passed from the consume server page to the client flow. */

export interface ConsumableProduct {
  productId: string;
  name: string;
  shortName: string;
  grade: string | null;
  category: string;
  tinSizeGrams: number;
  onHandTins: number;
  aduGramsPerDay: number;
}

export interface RecentMovementRow {
  movementId: string;
  /** ISO string */
  date: string;
  productName: string;
  tins: number;
  type: string;
  channel: string | null;
  lotNumber: string | null;
}
