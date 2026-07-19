export type VendorItemStatus = "listed" | "sold";

/** A named shelf ("$5 binder", "Display case") vendor items can belong to. */
export interface VendorGroup {
  id: string;
  name: string;
  createdAt: string;
}

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
  /** Group membership — sold receipts keep it for the "sold from" subtitle. */
  groupId?: string;
}
