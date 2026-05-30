import { getDatabase } from "@/lib/database";

export function recordCollectionValueSnapshot(): void {
	const db = getDatabase();
	const totals = db.getFirstSync<{ total_value: number }>(
		`SELECT COALESCE(SUM(card_value * quantity), 0) as total_value
		   FROM collection_cards`,
	);
	const totalValue = totals?.total_value ?? 0;

	const last = db.getFirstSync<{ total_value: number }>(
		`SELECT total_value FROM collection_value_snapshots
		   ORDER BY id DESC LIMIT 1`,
	);
	if (last && Math.abs(last.total_value - totalValue) < 0.005) return;

	db.runSync(
		`INSERT INTO collection_value_snapshots (recorded_at, total_value)
		   VALUES (?, ?)`,
		[new Date().toISOString(), totalValue],
	);
}
