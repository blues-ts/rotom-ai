import { useQuery } from "@tanstack/react-query";
import { getDatabase } from "@/lib/database";
import { buildCollectionSnapshot } from "@/lib/collectionSnapshot";
import type { Collection, CollectionCard } from "@/types/collection";

interface CollectionRow {
	id: string;
	name: string;
	created_at: string;
}

interface CollectionCardRow {
	id: string;
	collection_id: string;
	card_id: string;
	card_name: string;
	card_image_url: string;
	card_value: number;
	added_at: string;
	pricing_type: string;
	source: string;
	condition: string;
	graded_company: string | null;
	graded_grade: string | null;
	quantity: number;
	price_paid: number | null;
}

export const COLLECTION_SNAPSHOT_KEY = ["collectionSnapshot"] as const;

export function useCollectionSnapshot() {
	const db = getDatabase();

	return useQuery({
		queryKey: COLLECTION_SNAPSHOT_KEY,
		queryFn: () => {
			const collectionRows = db.getAllSync<CollectionRow>(
				`SELECT id, name, created_at FROM collections ORDER BY created_at ASC`,
			);
			const cardRows = db.getAllSync<CollectionCardRow>(
				`SELECT * FROM collection_cards ORDER BY card_value * quantity DESC`,
			);

			const collections: Collection[] = collectionRows.map((r) => ({
				id: r.id,
				name: r.name,
				createdAt: r.created_at,
				cardCount: 0,
				totalValue: 0,
				cardImages: [],
			}));

			const cardsByCollection: Record<string, CollectionCard[]> = {};
			for (const row of cardRows) {
				const card: CollectionCard = {
					id: row.id,
					collectionId: row.collection_id,
					cardId: row.card_id,
					cardName: row.card_name,
					cardImageUrl: row.card_image_url,
					cardValue: row.card_value,
					addedAt: row.added_at,
					pricingType: row.pricing_type,
					source: row.source,
					condition: row.condition,
					gradedCompany: row.graded_company ?? undefined,
					gradedGrade: row.graded_grade ?? undefined,
					quantity: row.quantity,
					pricePaid: row.price_paid ?? undefined,
				};
				if (!cardsByCollection[card.collectionId]) {
					cardsByCollection[card.collectionId] = [];
				}
				cardsByCollection[card.collectionId].push(card);
			}

			return buildCollectionSnapshot(collections, cardsByCollection);
		},
		staleTime: Infinity,
	});
}
