import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

// Schema versions:
//   0/1 — legacy Poketrace-era schema (source/condition columns keyed to the
//         old provider; card_ids that no longer resolve).
//   2   — Scrydex schema: `variant` replaces `source`, conditions are Scrydex
//         codes (NM/LP/...). Old data is unrecoverable against the new API,
//         so anything below 2 is dropped wholesale (pre-launch reset).
//   3   — adds `product_type` ('card' | 'sealed') so sealed products can be
//         collected; price refresh uses it to pick the right endpoint.
//   4   — adds `vendor_items` (the vending/for-sale inventory: asking price,
//         sold price, revenue tracking). Purely additive.
const SCHEMA_VERSION = 4;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync("rotom.db");
    db.execSync("PRAGMA journal_mode = WAL");
    db.execSync("PRAGMA foreign_keys = ON");

    const row = db.getFirstSync<{ user_version: number }>("PRAGMA user_version");
    const version = row?.user_version ?? 0;

    if (version < 2) {
      db.execSync(`
        DROP TABLE IF EXISTS collection_cards;
        DROP TABLE IF EXISTS collections;
        DROP TABLE IF EXISTS collection_value_snapshots;
      `);
    }

    db.execSync(`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS collection_cards (
        id TEXT PRIMARY KEY NOT NULL,
        collection_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        card_name TEXT NOT NULL,
        card_image_url TEXT NOT NULL,
        card_value REAL NOT NULL DEFAULT 0,
        added_at TEXT NOT NULL DEFAULT (datetime('now')),
        pricing_type TEXT NOT NULL DEFAULT 'Raw',
        product_type TEXT NOT NULL DEFAULT 'card',
        variant TEXT NOT NULL DEFAULT 'normal',
        condition TEXT NOT NULL DEFAULT 'NM',
        graded_company TEXT,
        graded_grade TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        price_paid REAL,
        card_value_updated_at TEXT,
        card_number TEXT,
        set_name TEXT,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_card
        ON collection_cards(collection_id, card_id, pricing_type, variant, condition, COALESCE(graded_company, ''), COALESCE(graded_grade, ''));

      CREATE TABLE IF NOT EXISTS vendor_items (
        id TEXT PRIMARY KEY NOT NULL,
        card_id TEXT NOT NULL,
        card_name TEXT NOT NULL,
        card_number TEXT,
        set_name TEXT,
        card_image_url TEXT NOT NULL,
        market_value REAL NOT NULL DEFAULT 0,
        market_value_updated_at TEXT,
        pricing_type TEXT NOT NULL DEFAULT 'Raw',
        product_type TEXT NOT NULL DEFAULT 'card',
        variant TEXT NOT NULL DEFAULT 'normal',
        condition TEXT NOT NULL DEFAULT 'NM',
        graded_company TEXT,
        graded_grade TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        asking_price REAL,
        status TEXT NOT NULL DEFAULT 'listed',
        sold_price REAL,
        sold_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_vendor_items_status
        ON vendor_items(status);

      CREATE TABLE IF NOT EXISTS collection_value_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recorded_at TEXT NOT NULL,
        total_value REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_value_snapshots_recorded_at
        ON collection_value_snapshots(recorded_at);
    `);

    // v2 → v3: non-destructive — existing rows are all cards. Detected by
    // column presence rather than user_version: dev hot-reloads can stamp a
    // version before the matching DDL has run, so the stamp alone isn't
    // trustworthy.
    const columns = db
      .getAllSync<{ name: string }>("PRAGMA table_info(collection_cards)")
      .map((c) => c.name);
    if (!columns.includes("product_type")) {
      db.execSync(
        "ALTER TABLE collection_cards ADD COLUMN product_type TEXT NOT NULL DEFAULT 'card';",
      );
    }

    db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  return db;
}
