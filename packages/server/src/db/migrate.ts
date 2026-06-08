// ============================================================
// Database migration — 幂等迁移引擎
// ============================================================

import { getDb, saveDb } from "./connection.js";
import {
  SCHEMA_VERSION,
  SCHEMA_DDL,
  SCHEMA_INDEXES,
  SCHEMA_VERSION_DDL,
  PRAGMAS,
} from "./schema.js";

/**
 * Run all migrations. Idempotent — safe to call multiple times.
 * After migration, saves the database to disk.
 */
export function migrate(): void {
  const db = getDb();

  // 1. Apply PRAGMAs first
  for (const pragma of PRAGMAS) {
    db.run(pragma);
  }

  // 2. Create schema version tracking table
  db.run(SCHEMA_VERSION_DDL);

  // 3. Get current version
  const result = db.exec("SELECT MAX(version) as v FROM schema_version");
  const currentVersion = result[0]?.values[0]?.[0] as number | null ?? 0;

  // 4. If up to date, skip
  if (currentVersion >= SCHEMA_VERSION) {
    // Still re-apply indexes (they're idempotent)
    for (const idx of SCHEMA_INDEXES) {
      db.run(idx);
    }
    saveDb();
    return;
  }

  // 5. Apply DDL in order (each is idempotent with IF NOT EXISTS)
  for (const ddl of SCHEMA_DDL) {
    db.run(ddl);
  }

  // 6. Create all indexes
  for (const idx of SCHEMA_INDEXES) {
    db.run(idx);
  }

  // 7. Record the schema version
  db.run(
    "INSERT INTO schema_version (version) VALUES (?)",
    [SCHEMA_VERSION]
  );

  // 8. Persist to disk
  saveDb();
}

/**
 * Reset the database — drops all tables.
 * Used only in tests.
 */
export function resetDb(): void {
  const db = getDb();
  db.run("PRAGMA foreign_keys = OFF");

  const tables = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  const tableNames = tables[0]?.values.map((row) => row[0] as string) ?? [];

  for (const name of tableNames) {
    db.run(`DROP TABLE IF EXISTS "${name}"`);
  }

  db.run("PRAGMA foreign_keys = ON");
  saveDb();
}

/**
 * Get current migration status.
 */
export function migrationStatus(): {
  currentVersion: number;
  targetVersion: number;
  needsMigration: boolean;
} {
  const db = getDb();
  try {
    const result = db.exec(
      "SELECT MAX(version) as v FROM schema_version"
    );
    const current = (result[0]?.values[0]?.[0] as number | null) ?? 0;
    return {
      currentVersion: current,
      targetVersion: SCHEMA_VERSION,
      needsMigration: current < SCHEMA_VERSION,
    };
  } catch {
    return {
      currentVersion: 0,
      targetVersion: SCHEMA_VERSION,
      needsMigration: true,
    };
  }
}
