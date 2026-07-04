import { getDatabase } from "@/lib/database";

/**
 * Dev-only: seed daily snapshots over the past `days` days with visible
 * volatility, trend waves, and a handful of "event" jumps simulating
 * buying/selling cards. Scales the whole curve so the final point lands on
 * the user's current real total — preventing a mount-time snapshot from
 * creating a visual spike at the end. Wipes existing snapshots first.
 */
export function seedCollectionValueHistory(days = 400): void {
	const db = getDatabase();
	db.runSync("DELETE FROM collection_value_snapshots");

	const totals = db.getFirstSync<{ total_value: number }>(
		`SELECT COALESCE(SUM(card_value * quantity), 0) as total_value
		   FROM collection_cards`,
	);
	const currentTotal = Math.max(100, totals?.total_value ?? 1000);

	const eventDays = new Set<number>();
	while (eventDays.size < 10) {
		eventDays.add(Math.floor(Math.random() * days));
	}

	const dayMs = 24 * 60 * 60 * 1000;
	const now = Date.now();
	const points: { ts: Date; value: number }[] = [];

	let value = currentTotal * 0.55; // start ~55% of current
	for (let i = 0; i <= days; i++) {
		const dayFromStart = days - i;
		const ts = new Date(now - dayFromStart * dayMs);

		if (eventDays.has(dayFromStart)) {
			const eventMag = 0.12 + Math.random() * 0.12; // 12–24%
			const direction = Math.random() < 0.65 ? 1 : -1; // upward bias
			value = Math.max(50, value * (1 + direction * eventMag));
		} else {
			const phase = (i / days) * Math.PI * 3;
			const trend = Math.sin(phase) * 0.008; // gentle trend wave
			const noise = (Math.random() - 0.5) * 0.06; // ±3% daily
			value = Math.max(50, value * (1 + trend + noise));
		}

		points.push({ ts, value });
	}

	// Normalize so the last point lands on the user's actual current total.
	// Today's mount-time recordCollectionValueSnapshot() will dedupe against
	// this final value (within $0.005) and skip — no end-of-chart spike.
	const finalValue = points[points.length - 1].value;
	const scale = currentTotal / finalValue;
	// One transaction for the batch — 400 individual inserts each pay a disk
	// sync otherwise.
	db.withTransactionSync(() => {
		for (const p of points) {
			db.runSync(
				"INSERT INTO collection_value_snapshots (recorded_at, total_value) VALUES (?, ?)",
				[p.ts.toISOString(), Math.round(p.value * scale * 100) / 100],
			);
		}
	});
}

/**
 * Dev-only: wipe all snapshots, then record a fresh one from current
 * collection state so the chart isn't empty.
 */
export function clearCollectionValueHistory(): void {
	const db = getDatabase();
	db.runSync("DELETE FROM collection_value_snapshots");
	recordCollectionValueSnapshot();
}

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
