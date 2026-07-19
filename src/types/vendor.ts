export type VendorItemStatus = "listed" | "sold";

export interface VendorItem {
  id: string;
  cardId: string;
  cardName: string;
  cardNumber?: string;
  setName?: string;
  cardImageUrl: string;
  /** Live market value for the stored variant/condition (refreshable). */
  marketValue: number;
  /** ISO timestamp of the last successful market-price refresh. */
  marketValueUpdatedAt?: string;
  pricingType: string;
  productType: string; // 'card' | 'sealed'
  variant: string;
  condition: string;
  gradedCompany?: string;
  gradedGrade?: string;
  quantity: number;
  /** Per-unit asking price the vendor set; unset means "not priced yet". */
  askingPrice?: number;
  status: VendorItemStatus;
  /** Per-unit price it actually sold for. */
  soldPrice?: number;
  soldAt?: string;
  createdAt: string;
}
