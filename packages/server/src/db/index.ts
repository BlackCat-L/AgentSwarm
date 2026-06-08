// Barrel export — database layer
export { initDb, getDb, saveDb, closeDb, isDbReady } from "./connection.js";
export { migrate, resetDb, migrationStatus } from "./migrate.js";
export { SCHEMA_VERSION, SCHEMA_DDL, SCHEMA_INDEXES } from "./schema.js";
