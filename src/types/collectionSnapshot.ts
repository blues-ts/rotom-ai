export interface CollectionSnapshotEntry {
	id: string;
	name: string;
	cardCount: number;
	uniqueCards: number;
	totalValue: number;
	totalPaid: number | null;
}

export interface CollectionSnapshotTopCard {
	collectionId: string;
	collectionName: string;
	cardId: string;
	name: string;
	imageUrl?: string;
	value: number;
	quantity: number;
	condition: string;
	pricingType: string;
	gradedCompany?: string;
	gradedGrade?: string;
	pricePaid?: number;
}

export interface CollectionSnapshot {
	version: 1;
	generatedAt: string;
	summary: {
		collectionCount: number;
		totalCards: number;
		uniqueCards: number;
		totalValue: number;
		totalPaid: number | null;
		currency: "USD";
	};
	collections: CollectionSnapshotEntry[];
	gradeDistribution: {
		raw: number;
		graded: Record<string, number>;
	};
	topCards: CollectionSnapshotTopCard[];
	truncated: {
		omittedCardLines: number;
		omittedValue: number;
	};
}
