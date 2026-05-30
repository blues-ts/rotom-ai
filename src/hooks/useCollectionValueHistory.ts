import { keepPreviousData, useQuery } from "@tanstack/react-query";
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

function periodCutoff(period: ValueHistoryPeriod): string | null {
	if (period === "all") return null;
	const days =
		period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 365;
	const d = new Date();
	d.setDate(d.getDate() - days);
	return d.toISOString();
}

export function useCollectionValueHistory(period: ValueHistoryPeriod = "30d") {
	const db = getDatabase();
	return useQuery({
		queryKey: ["collectionValueHistory", period],
		queryFn: (): ValueHistoryPoint[] => {
			const cutoff = periodCutoff(period);
			const rows = cutoff
				? db.getAllSync<Row>(
						`SELECT recorded_at, total_value FROM collection_value_snapshots
						   WHERE recorded_at >= ? ORDER BY recorded_at ASC`,
						[cutoff],
					)
				: db.getAllSync<Row>(
						`SELECT recorded_at, total_value FROM collection_value_snapshots
						   ORDER BY recorded_at ASC`,
					);
			return rows.map((r) => ({
				timestamp: new Date(r.recorded_at).getTime(),
				value: r.total_value,
			}));
		},
		staleTime: Infinity,
		placeholderData: keepPreviousData,
	});
}
