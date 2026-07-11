import { useQuery } from "@tanstack/react-query";
import { getDatabase } from "@/lib/database";
import { COLLECTION_SNAPSHOT_KEY } from "@/hooks/useCollectionSnapshot";

// Child of the snapshot key: every collection mutation in useCollections.ts
// already invalidates the ["collectionSnapshot", 2] prefix, so this refreshes
// on any add/remove with no extra invalidation wiring.
export const OWNED_CARD_IDS_KEY = [
	...COLLECTION_SNAPSHOT_KEY,
	"ownedCardIds",
] as const;

/**
 * Distinct card ids the user owns across ALL collections — any variant or
 * condition counts once. Returned as an array (not a Set) because the query
 * cache is persisted as JSON.
 */
export function useOwnedCardIds(enabled = true) {
	return useQuery({
		queryKey: OWNED_CARD_IDS_KEY,
		queryFn: async () => {
			const db = getDatabase();
			const rows = await db.getAllAsync<{ card_id: string }>(
				`SELECT DISTINCT card_id FROM collection_cards
				 WHERE product_type = 'card' AND quantity > 0`,
			);
			return rows.map((r) => r.card_id);
		},
		enabled,
		staleTime: Infinity,
	});
}
