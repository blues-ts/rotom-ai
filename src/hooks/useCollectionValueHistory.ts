import { useQuery } from "@tanstack/react-query";
import { getDatabase } from "@/lib/database";

export type ValueHistoryPeriod = "7d" | "30d" | "90d" | "1y" | "all";

export interface ValueHistoryPoint {
	timestamp: number;
	value: number;
}

interface Row {
	recorded_at: string;
	total_value: number;
}

/**
 * The full snapshot history in one query — period slicing happens client-side
 * (see CollectionValueChart) so switching ranges never re-reads the database.
 * Refreshed via invalidation after recordCollectionValueSnapshot().
 */
export function useCollectionValueHistory() {
	const db = getDatabase();
	return useQuery({
		queryKey: ["collectionValueHistory"],
		queryFn: (): ValueHistoryPoint[] => {
			const rows = db.getAllSync<Row>(
				`SELECT recorded_at, total_value FROM collection_value_snapshots
				   ORDER BY recorded_at ASC`,
			);
			return rows.map((r) => ({
				timestamp: new Date(r.recorded_at).getTime(),
				value: r.total_value,
			}));
		},
		staleTime: Infinity,
	});
}
