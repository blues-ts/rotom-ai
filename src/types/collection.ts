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
  cardImageUrl: string;
  cardValue: number;
  addedAt: string;
  pricingType: string;
  source: string;
  condition: string;
  gradedCompany?: string;
  gradedGrade?: string;
  quantity: number;
  pricePaid?: number;
}
