import type { Collection, CollectionCard } from "@/types/collection";
import type {
	CollectionSnapshot,
	CollectionSnapshotEntry,
	CollectionSnapshotTopCard,
} from "@/types/collectionSnapshot";

export const TOP_N = 150;

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

function gradeKey(card: CollectionCard): string {
	if (card.pricingType !== "Graded") return "";
	if (card.gradedCompany && card.gradedGrade) {
		return `${card.gradedCompany} ${card.gradedGrade}`;
	}
	return "Graded (unknown)";
}

export function buildCollectionSnapshot(
	collections: Collection[],
	cardsByCollection: Record<string, CollectionCard[]>,
): CollectionSnapshot | null {
	if (collections.length === 0) return null;

	const nameById = new Map(collections.map((c) => [c.id, c.name]));

	const allCards: Array<{
		card: CollectionCard;
		collectionId: string;
		collectionName: string;
		lineValue: number;
	}> = [];

	const perCollectionTotals = new Map<
		string,
		{ cardCount: number; unique: Set<string>; value: number; paid: number; paidCount: number }
	>();

	const gradedCounts: Record<string, number> = {};
	let rawQty = 0;

	for (const collection of collections) {
		perCollectionTotals.set(collection.id, {
			cardCount: 0,
			unique: new Set(),
			value: 0,
			paid: 0,
			paidCount: 0,
		});
	}

	for (const collection of collections) {
		const cards = cardsByCollection[collection.id] ?? [];
		const totals = perCollectionTotals.get(collection.id)!;
		for (const card of cards) {
			const qty = card.quantity ?? 1;
			const lineValue = card.cardValue * qty;
			totals.cardCount += qty;
			totals.unique.add(card.cardId);
			totals.value += lineValue;
			if (card.pricePaid !== undefined && card.pricePaid !== null) {
				totals.paid += card.pricePaid * qty;
				totals.paidCount += 1;
			}

			if (card.pricingType === "Graded") {
				const key = gradeKey(card);
				gradedCounts[key] = (gradedCounts[key] ?? 0) + qty;
			} else {
				rawQty += qty;
			}

			allCards.push({
				card,
				collectionId: collection.id,
				collectionName: collection.name,
				lineValue,
			});
		}
	}

	allCards.sort((a, b) => b.lineValue - a.lineValue);

	const top = allCards.slice(0, TOP_N);
	const omitted = allCards.slice(TOP_N);

	const topCards: CollectionSnapshotTopCard[] = top.map(
		({ card, collectionId, collectionName }) => {
			const entry: CollectionSnapshotTopCard = {
				collectionId,
				collectionName,
				cardId: card.cardId,
				name: card.cardName,
				value: round2(card.cardValue),
				quantity: card.quantity ?? 1,
				condition: card.condition,
				pricingType: card.pricingType,
			};
			if (card.cardImageUrl) entry.imageUrl = card.cardImageUrl;
			if (card.gradedCompany) entry.gradedCompany = card.gradedCompany;
			if (card.gradedGrade) entry.gradedGrade = card.gradedGrade;
			if (card.pricePaid !== undefined && card.pricePaid !== null) {
				entry.pricePaid = round2(card.pricePaid);
			}
			return entry;
		},
	);

	let totalValue = 0;
	let totalPaid = 0;
	let anyPaid = false;
	let totalCards = 0;
	const uniqueCardIds = new Set<string>();

	const collectionsOut: CollectionSnapshotEntry[] = collections.map((c) => {
		const t = perCollectionTotals.get(c.id)!;
		totalValue += t.value;
		totalCards += t.cardCount;
		t.unique.forEach((id) => uniqueCardIds.add(id));
		const entryPaid = t.paidCount > 0 ? round2(t.paid) : null;
		if (t.paidCount > 0) {
			totalPaid += t.paid;
			anyPaid = true;
		}
		return {
			id: c.id,
			name: c.name,
			cardCount: t.cardCount,
			uniqueCards: t.unique.size,
			totalValue: round2(t.value),
			totalPaid: entryPaid,
		};
	});

	const omittedValue = omitted.reduce((sum, x) => sum + x.lineValue, 0);

	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		summary: {
			collectionCount: collections.length,
			totalCards,
			uniqueCards: uniqueCardIds.size,
			totalValue: round2(totalValue),
			totalPaid: anyPaid ? round2(totalPaid) : null,
			currency: "USD",
		},
		collections: collectionsOut,
		gradeDistribution: {
			raw: rawQty,
			graded: gradedCounts,
		},
		topCards,
		truncated: {
			omittedCardLines: omitted.length,
			omittedValue: round2(omittedValue),
		},
	};
}
