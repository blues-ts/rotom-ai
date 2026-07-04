import * as SQLite from "expo-sqlite";

import { getDatabase } from "@/lib/database";

// Dev-only: measures the SQLite access patterns this app uses against a
// scratch database, so the sync-vs-transactional-async migration can be
// verified with numbers on a real device instead of taken on faith.
//
// Two metrics per bench:
//   wall — how long the operation took end to end.
//   JS blocked — the longest stretch the JS thread couldn't service a 16ms
//   heartbeat timer while the bench ran. This is the number users feel: while
//   the JS thread is blocked, taps go dead and React can't commit. Sync work
//   blocks for its whole duration; async work should leave this near zero.

const BENCH_DB = "perf-bench.db";
const TICK_MS = 16;

interface BenchResult {
	label: string;
	wallMs: number;
	jsBlockedMs: number;
}

function startStallMeter(): () => number {
	let last = performance.now();
	let maxStall = 0;
	const id = setInterval(() => {
		const now = performance.now();
		const stall = now - last - TICK_MS;
		if (stall > maxStall) maxStall = stall;
		last = now;
	}, TICK_MS);
	return () => {
		clearInterval(id);
		// Fully-sync benches never let the interval fire at all — the stall is
		// still in progress when the caller stops the meter, so count the tail.
		const tail = performance.now() - last - TICK_MS;
		return Math.max(maxStall, tail, 0);
	};
}

async function bench(
	label: string,
	run: () => Promise<void> | void,
): Promise<BenchResult> {
	// Let pending timers and renders settle so they don't pollute the meter.
	await new Promise((r) => setTimeout(r, 80));
	const stop = startStallMeter();
	const t0 = performance.now();
	await run();
	const wallMs = performance.now() - t0;
	return { label, wallMs, jsBlockedMs: stop() };
}

function fmt(r: BenchResult): string {
	return `${r.label}\n    ${Math.round(r.wallMs)}ms wall · ${Math.round(
		r.jsBlockedMs,
	)}ms JS blocked`;
}

/**
 * Seeds `rowCount` fake card rows, then re-prices every row (two UPDATEs per
 * row, mirroring the real refresh sweep) three ways: the old per-statement
 * sync pattern, sync inside one transaction, and the shipped pattern — async
 * inside one transaction. Also compares a full-table read sync vs async.
 * Returns a human-readable report (also useful via console).
 */
export async function runSqliteBenchmark(rowCount = 1000): Promise<string> {
	await SQLite.deleteDatabaseAsync(BENCH_DB).catch(() => {});
	const db = await SQLite.openDatabaseAsync(BENCH_DB);

	try {
		await db.execAsync(`
			PRAGMA journal_mode = WAL;
			CREATE TABLE bench_cards (
				id TEXT PRIMARY KEY NOT NULL,
				card_value REAL NOT NULL DEFAULT 0,
				card_value_updated_at TEXT,
				card_image_url TEXT NOT NULL
			);
		`);

		const ids = Array.from({ length: rowCount }, (_, i) => `card-${i}`);
		db.withTransactionSync(() => {
			for (const id of ids) {
				db.runSync(
					"INSERT INTO bench_cards (id, card_value, card_image_url) VALUES (?, ?, ?)",
					[id, Math.random() * 100, `https://images.example.com/${id}/medium`],
				);
			}
		});

		const now = new Date().toISOString();
		const updateRow = async (id: string) => {
			await db.runAsync(
				"UPDATE bench_cards SET card_value = ?, card_value_updated_at = ? WHERE id = ?",
				[Math.random() * 100, now, id],
			);
			await db.runAsync(
				"UPDATE bench_cards SET card_image_url = ? WHERE id = ?",
				[`https://images.example.com/${id}/large`, id],
			);
		};
		const updateRowSync = (id: string) => {
			db.runSync(
				"UPDATE bench_cards SET card_value = ?, card_value_updated_at = ? WHERE id = ?",
				[Math.random() * 100, now, id],
			);
			db.runSync(
				"UPDATE bench_cards SET card_image_url = ? WHERE id = ?",
				[`https://images.example.com/${id}/large`, id],
			);
		};

		const results: BenchResult[] = [];

		results.push(
			await bench("OLD  per-row sync, no transaction", () => {
				for (const id of ids) updateRowSync(id);
			}),
		);
		results.push(
			await bench("     per-row sync, one transaction", () => {
				db.withTransactionSync(() => {
					for (const id of ids) updateRowSync(id);
				});
			}),
		);
		results.push(
			await bench("NEW  per-row async, one transaction", async () => {
				await db.withTransactionAsync(async () => {
					for (const id of ids) await updateRow(id);
				});
			}),
		);
		results.push(
			await bench("OLD  full-table getAllSync", () => {
				db.getAllSync("SELECT * FROM bench_cards");
			}),
		);
		results.push(
			await bench("NEW  full-table getAllAsync", async () => {
				await db.getAllAsync("SELECT * FROM bench_cards");
			}),
		);

		const [writeOld, writeTxn, writeNew, readOld, readNew] = results;
		return [
			`${rowCount.toLocaleString()} rows × 2 UPDATEs`,
			"",
			"WRITE SWEEP",
			fmt(writeOld),
			fmt(writeTxn),
			fmt(writeNew),
			"",
			"FULL-TABLE READ",
			fmt(readOld),
			fmt(readNew),
		].join("\n");
	} finally {
		await db.closeAsync().catch(() => {});
		await SQLite.deleteDatabaseAsync(BENCH_DB).catch(() => {});
	}
}

/**
 * Runs the benchmark and also persists the report to `perf-report.db` in the
 * app sandbox. On the simulator that container is a plain folder on the Mac,
 * so automated runs (deep link `riverai:///(settings)?bench=1`) can be read
 * back with the host `sqlite3` CLI instead of depending on Metro's console:
 *
 *   sqlite3 "$(xcrun simctl get_app_container booted com.riverai.app data)/Documents/SQLite/perf-report.db" \
 *     "SELECT report FROM reports ORDER BY id DESC LIMIT 1;"
 */
export async function runAndStoreSqliteBenchmark(
	rowCount?: number,
): Promise<string> {
	const report = await runSqliteBenchmark(rowCount);
	const out = await SQLite.openDatabaseAsync("perf-report.db");
	try {
		await out.execAsync(
			`CREATE TABLE IF NOT EXISTS reports (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				created_at TEXT NOT NULL,
				report TEXT NOT NULL
			)`,
		);
		await out.runAsync(
			"INSERT INTO reports (created_at, report) VALUES (?, ?)",
			[new Date().toISOString(), report],
		);
	} finally {
		await out.closeAsync().catch(() => {});
	}
	return report;
}

/**
 * Headless trigger for simulator automation: the host writes a flag row into
 * rotom.db (`INSERT INTO dev_flags VALUES ('run-sqlite-bench')` via the
 * sqlite3 CLI against the app container), relaunches the app, and this —
 * called once at launch in dev — consumes the flag, runs the benchmark, and
 * persists the report for the host to read back. No-op when the flag (or the
 * dev_flags table) doesn't exist.
 */
export async function maybeRunSqliteBenchmarkFromFlag(): Promise<void> {
	if (!__DEV__) return;
	const db = getDatabase();
	let rowCount: number | undefined;
	try {
		// Optional row count suffix: 'run-sqlite-bench:5000'.
		const row = db.getFirstSync<{ name: string }>(
			"SELECT name FROM dev_flags WHERE name LIKE 'run-sqlite-bench%' LIMIT 1",
		);
		if (!row) return;
		db.runSync("DELETE FROM dev_flags WHERE name = ?", [row.name]);
		rowCount = Number(row.name.split(":")[1]) || undefined;
	} catch {
		return; // dev_flags table absent — flag never set
	}
	const report = await runAndStoreSqliteBenchmark(rowCount);
	console.log(`[perf-bench]\n${report}`);
}
