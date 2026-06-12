export interface Collection {
  id: string;
  name: string;
  createdAt: string;
  cardCount: number;
  totalValue: number;
  cardImages: string[];
}

export interface CollectionCard {
  id: string;
  collectionId: string;
  cardId: string;
  cardName: string;
  cardNumber?: string;
  setName?: string;
  cardImageUrl: string;
  cardValue: number;
  addedAt: string;
  pricingType: string;
  productType: string; // 'card' | 'sealed'
  variant: string;
  condition: string;
  gradedCompany?: string;
  gradedGrade?: string;
  quantity: number;
  pricePaid?: number;
}
