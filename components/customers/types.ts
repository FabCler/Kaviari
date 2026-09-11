/** Serializable rows passed from the Customers server page to the client view. */

export interface CustomerSaleEntry {
  customerCode: string;
  customerName: string;
  /** PR code as text; null for the export's "(blank)" bucket. */
  prCode: string | null;
  /** Catalog name when the PR code matches a product, else the file's description. */
  productName: string;
  caviarType: string | null;
  category: string | null;
  year: number;
  month: number; // 1-12
  quantity: number;
}

export interface CustomerSalesMeta {
  fileName: string | null;
  uploadedAt: string | null;
}
