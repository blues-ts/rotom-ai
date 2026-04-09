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
  }
  return db;
}
