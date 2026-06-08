// ============================================================
// SQLite connection manager (sql.js — WASM fallback)
// PRD Risk §12: better-sqlite3 compiling failure → sql.js
// ============================================================

import initSqlJs, { Database as SqlJsDb, SqlJsStatic } from "sql.js";
import * as fs from "node:fs";
import * as path from "node:path";

let SQL: SqlJsStatic | null = null;
let db: SqlJsDb | null = null;
let dbPath: string = "";

const DEFAULT_DB_PATH = "agent-swarm.db";

/**
 * Initialize the SQLite database.
 * Must be called once at server startup before any queries.
 */
export async function initDb(filePath?: string): Promise<SqlJsDb> {
  if (db) return db;

  SQL = await initSqlJs();
  dbPath = filePath ?? DEFAULT_DB_PATH;

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys and other pragmas
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA journal_mode = MEMORY");

  return db;
}

/**
 * Get the initialized database instance.
 * Throws if initDb() hasn't been called.
 */
export function getDb(): SqlJsDb {
  if (!db) {
    throw new Error(
      "Database not initialized. Call initDb() first."
    );
  }
  return db;
}

/**
 * Persist the in-memory database to disk.
 * sql.js keeps the entire DB in WASM memory.
 * This writes the current state to the file.
 */
export function saveDb(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const dir = path.dirname(path.resolve(dbPath));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(dbPath, buffer);
}

/**
 * Close the database connection, saving to disk first.
 */
export async function closeDb(): Promise<void> {
  if (!db) return;
  saveDb();
  db.close();
  db = null;
  SQL = null;
}

/**
 * Check if the database is initialized.
 */
export function isDbReady(): boolean {
  return db !== null;
}
