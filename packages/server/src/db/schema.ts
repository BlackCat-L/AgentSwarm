// ============================================================
// SQLite DDL Schema — 对齐 PRD §4.4 (9 tables + indices)
// ============================================================

/**
 * Versioned schema definitions. Each entry is a migration version.
 * DDL statements are executed in order, idempotently.
 */
export const SCHEMA_VERSION = 6;

export const SCHEMA_DDL = [
  // ====== 1. projects ======
  `CREATE TABLE IF NOT EXISTS projects (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    path          TEXT NOT NULL UNIQUE,
    worktree_base TEXT,
    claude_md     TEXT,
    config        TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ====== 2. agents ======
  `CREATE TABLE IF NOT EXISTS agents (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL,
    runtime       TEXT NOT NULL DEFAULT 'claude-code' CHECK(runtime IN ('claude-code','hermes','openclaw')),
    model         TEXT NOT NULL DEFAULT 'sonnet' CHECK(model IN ('opus','sonnet','haiku')),
    status        TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','busy','offline','error','paused')),
    worktree_path TEXT,
    current_task_id TEXT,
    capabilities  TEXT NOT NULL DEFAULT '[]',
    last_heartbeat TEXT,
    permission_mode TEXT NOT NULL DEFAULT 'acceptEdits',
    pid           INTEGER,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ====== 3. agent_capabilities ======
  `CREATE TABLE IF NOT EXISTS agent_capabilities (
    agent_id      TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
    capabilities  TEXT NOT NULL DEFAULT '{}',
    success_rate  TEXT NOT NULL DEFAULT '{}',
    total_completed INTEGER NOT NULL DEFAULT 0,
    total_failed  INTEGER NOT NULL DEFAULT 0,
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ====== 4. tasks ======
  `CREATE TABLE IF NOT EXISTS tasks (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'Backlog' CHECK(status IN (
                    'Backlog','InDev','ReadyForTest','InFix',
                    'ReadyForDeploy','Done','Blocked','Cancelled')),
    priority      INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 0 AND 4),
    complexity    INTEGER,
    owner_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    input         TEXT,
    expected_output TEXT,
    acceptance_criteria TEXT,
    required_capabilities TEXT NOT NULL DEFAULT '[]',
    version       INTEGER NOT NULL DEFAULT 1,
    retry_count   INTEGER NOT NULL DEFAULT 0,
    max_retries   INTEGER NOT NULL DEFAULT 3,
    timeout_ms    INTEGER,
    error_message TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at  TEXT
  )`,

  // ====== 5. task_dependencies ======
  `CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on_id)
  )`,

  // ====== 6. cost_events ======
  `CREATE TABLE IF NOT EXISTS cost_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id      TEXT REFERENCES agents(id) ON DELETE SET NULL,
    task_id       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    model         TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd      REAL NOT NULL DEFAULT 0.0,
    timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ====== 7. messages ======
  `CREATE TABLE IF NOT EXISTS messages (
    id            TEXT PRIMARY KEY,
    from_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    to_agent_id   TEXT REFERENCES agents(id) ON DELETE SET NULL,
    type          TEXT NOT NULL CHECK(type IN ('task','result','question','interrupt','status','broadcast','rate_limit','session')),
    content       TEXT NOT NULL,
    metadata      TEXT NOT NULL DEFAULT '{}',
    read_by       TEXT NOT NULL DEFAULT '[]',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ====== 8. workflows ======
  `CREATE TABLE IF NOT EXISTS workflows (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type          TEXT NOT NULL DEFAULT 'standard-dev-team',
    current_phase INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','paused','completed','failed')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ====== 9. error_events ======
  `CREATE TABLE IF NOT EXISTS error_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
    agent_id      TEXT REFERENCES agents(id) ON DELETE SET NULL,
    task_id       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    type          TEXT NOT NULL,
    message       TEXT NOT NULL,
    stack         TEXT,
    timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

/** Index creation statements (idempotent via IF NOT EXISTS or run-once) */
export const SCHEMA_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deps_depends_on ON task_dependencies(depends_on_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`,
  `CREATE INDEX IF NOT EXISTS idx_cost_project_ts ON cost_events(project_id, timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_cost_agent ON cost_events(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_error_ts ON error_events(timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_error_agent ON error_events(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent_id)`,
];

/** DDL for schema version tracking */
export const SCHEMA_VERSION_DDL = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

/** SQLite PRAGMA statements applied on every connection */
export const PRAGMAS = [
  `PRAGMA foreign_keys = ON`,
  `PRAGMA journal_mode = MEMORY`,
];
