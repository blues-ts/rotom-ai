import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync("rotom.db");
    db.execSync("PRAGMA journal_mode = WAL");
    db.execSync("PRAGMA foreign_keys = ON");
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
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_card
        ON collection_cards(collection_id, card_id);
    `);

    // Add configuration columns if they don't exist
    const columns = db.getAllSync<{ name: string }>("PRAGMA table_info(collection_cards)").map(c => c.name);
    if (!columns.includes("pricing_type")) {
      db.execSync(`
        ALTER TABLE collection_cards ADD COLUMN pricing_type TEXT NOT NULL DEFAULT 'Raw';
        ALTER TABLE collection_cards ADD COLUMN source TEXT NOT NULL DEFAULT 'TCGPlayer';
        ALTER TABLE collection_cards ADD COLUMN condition TEXT NOT NULL DEFAULT 'NEAR_MINT';
        ALTER TABLE collection_cards ADD COLUMN graded_company TEXT;
        ALTER TABLE collection_cards ADD COLUMN graded_grade TEXT;
      `);
    }
    if (!columns.includes("quantity")) {
      db.execSync(`
        ALTER TABLE collection_cards ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;
      `);
    }
    if (!columns.includes("price_paid")) {
      db.execSync(`ALTER TABLE collection_cards ADD COLUMN price_paid REAL;`);
    }
    if (!columns.includes("card_value_updated_at")) {
      db.execSync(`ALTER TABLE collection_cards ADD COLUMN card_value_updated_at TEXT;`);
    }
    if (!columns.includes("card_number")) {
      db.execSync(`ALTER TABLE collection_cards ADD COLUMN card_number TEXT;`);
    }
    if (!columns.includes("set_name")) {
      db.execSync(`ALTER TABLE collection_cards ADD COLUMN set_name TEXT;`);
    }

    // Cleanup: an earlier version of the card detail page leaked auto-selected
    // gradedCompany/gradedGrade onto Raw cards. Wipe those values so search
    // and row identity don't accidentally treat Raw cards as graded.
    db.runSync(
      `UPDATE collection_cards
         SET graded_company = NULL, graded_grade = NULL
       WHERE pricing_type = 'Raw'
         AND (graded_company IS NOT NULL OR graded_grade IS NOT NULL)`,
    );

    // Update unique index to include config so same card with different config = different entry
    db.execSync(`
      DROP INDEX IF EXISTS idx_collection_card;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_card
        ON collection_cards(collection_id, card_id, pricing_type, source, condition, COALESCE(graded_company, ''), COALESCE(graded_grade, ''));
    `);

    // Migrate snapshots from old date-keyed schema to event-stream schema.
    const snapCols = db
      .getAllSync<{ name: string }>("PRAGMA table_info(collection_value_snapshots)")
      .map((c) => c.name);
    if (snapCols.includes("date")) {
      db.execSync("DROP TABLE collection_value_snapshots;");
    }

    db.execSync(`
      CREATE TABLE IF NOT EXISTS collection_value_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recorded_at TEXT NOT NULL,
        total_value REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_value_snapshots_recorded_at
        ON collection_value_snapshots(recorded_at);
    `);
  }
  return db;
}
