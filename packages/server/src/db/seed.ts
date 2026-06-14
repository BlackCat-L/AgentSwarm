// ── Auto-seed: creates default project + 12-agent team on first run ──
// Idempotent — skips if agents already exist.

import { getDb, saveDb } from "./connection.js";
import { CapabilityScorer } from "../engine/capability-scorer.js";
import { v4 as uuidv4 } from "uuid";

const DEFAULT_TEAM: Array<{ name: string; role: string; model: "deepseek-v4-pro[1m]" | "deepseek-v4-flash" }> = [
  // ── Heavy roles — need deep analysis, pro model ──
  { name: "编排官",       role: "orchestrator",          model: "deepseek-v4-pro[1m]" },
  { name: "产品经理",     role: "product-manager",       model: "deepseek-v4-pro[1m]" },
  { name: "软件架构师",   role: "software-architect",    model: "deepseek-v4-pro[1m]" },
  { name: "后端架构师",   role: "backend-architect",     model: "deepseek-v4-pro[1m]" },
  { name: "前端架构师",   role: "frontend-architect",    model: "deepseek-v4-pro[1m]" },
  { name: "数据库优化师", role: "database-optimizer",    model: "deepseek-v4-pro[1m]" },
  { name: "安全工程师",   role: "security-engineer",     model: "deepseek-v4-pro[1m]" },
  { name: "代码审查师",   role: "code-reviewer",         model: "deepseek-v4-pro[1m]" },
  // ── Light roles — implementation/validation, flash is sufficient ──
  { name: "UI设计师",     role: "ui-designer",           model: "deepseek-v4-flash" },
  { name: "前端开发",     role: "frontend-developer",    model: "deepseek-v4-flash" },
  { name: "DevOps自动化", role: "devops-automator",      model: "deepseek-v4-flash" },
  { name: "测试QA",       role: "testing-qa",            model: "deepseek-v4-flash" },
  { name: "验收官",       role: "reality-checker",       model: "deepseek-v4-flash" },
];

// Role → capability tag mapping for skill-based assignment
const ROLE_CAPABILITY_MAP: Record<string, string[]> = {
  "orchestrator":        ["architecture"],
  "product-manager":     ["architecture"],
  "software-architect":  ["architecture", "frontend"],
  "backend-architect":   ["architecture"],
  "frontend-architect":  ["frontend", "architecture"],
  "database-optimizer":  ["architecture", "performance"],
  "security-engineer":   ["security"],
  "code-reviewer":       ["testing"],
  "ui-designer":         ["frontend"],
  "frontend-developer":  ["frontend"],
  "devops-automator":    ["architecture"],
  "testing-qa":          ["testing"],
  "reality-checker":     ["testing"],
};

export function seed(): void {
  const db = getDb();

  // Check if agents already exist
  const count = db.prepare("SELECT COUNT(*) as cnt FROM agents");
  let hasAgents = false;
  if (count.step()) {
    const { cnt } = count.getAsObject() as { cnt: number };
    hasAgents = cnt > 0;
  }
  count.free();
  if (hasAgents) return; // Already seeded, skip

  console.log("🌱 Seeding 12-agent dream team...");

  // Ensure a default project exists
  let projectId: string;
  const proj = db.prepare("SELECT id FROM projects LIMIT 1");
  if (proj.step()) {
    projectId = (proj.getAsObject() as { id: string }).id;
  } else {
    projectId = uuidv4();
    db.run(
      `INSERT INTO projects (id, name, path, config, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      [projectId, "Agent Swarm 默认项目", ".", "{}", new Date().toISOString(), new Date().toISOString()]
    );
  }
  proj.free();

  // Insert agents
  const insert = db.prepare(
    `INSERT INTO agents (id, project_id, name, role, runtime, model, status, capabilities, permission_mode, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  );

  const now = new Date().toISOString();
  const insertedAgents: Array<{ id: string; caps: string[] }> = [];

  for (const agent of DEFAULT_TEAM) {
    const id = uuidv4();
    const caps = ROLE_CAPABILITY_MAP[agent.role] ?? ["architecture"];
    insert.bind([
      id, projectId, agent.name, agent.role, "claude-code", agent.model,
      "idle", JSON.stringify(caps), "acceptEdits", now
    ]);
    insert.step();
    insert.reset();
    insertedAgents.push({ id, caps });
  }
  insert.free();

  // Initialize capability scoring profiles AFTER freeing the insert statement
  // (avoids sql.js nested-statement conflict)
  const scorer = new CapabilityScorer();
  for (const { id, caps } of insertedAgents) {
    scorer.upsertCapabilityProfile(id, caps);
  }

  saveDb();
  console.log("✅ Seeded 12 agents successfully");
}

/** Seed the 12-agent team for a specific project. Idempotent. */
export function seedAgentsForProject(projectId: string): void {
  const db = getDb();

  // Skip if project already has agents
  const count = db.prepare("SELECT COUNT(*) as cnt FROM agents WHERE project_id = ?");
  count.bind([projectId]);
  let hasAgents = false;
  if (count.step()) {
    const { cnt } = count.getAsObject() as { cnt: number };
    hasAgents = cnt > 0;
  }
  count.free();
  if (hasAgents) return;

  console.log(`🌱 Seeding 12-agent team for project ${projectId.slice(0, 8)}...`);

  const insert = db.prepare(
    `INSERT INTO agents (id, project_id, name, role, runtime, model, status, capabilities, permission_mode, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  );

  const now = new Date().toISOString();
  const insertedAgents: Array<{ id: string; caps: string[] }> = [];

  for (const agent of DEFAULT_TEAM) {
    const id = uuidv4();
    const caps = ROLE_CAPABILITY_MAP[agent.role] ?? ["architecture"];
    insert.bind([
      id, projectId, agent.name, agent.role, "claude-code", agent.model,
      "idle", JSON.stringify(caps), "acceptEdits", now
    ]);
    insert.step();
    insert.reset();
    insertedAgents.push({ id, caps });
  }
  insert.free();

  // Initialize capability scoring profiles AFTER freeing the insert statement
  const scorer = new CapabilityScorer();
  for (const { id, caps } of insertedAgents) {
    scorer.upsertCapabilityProfile(id, caps);
  }

  saveDb();
  console.log(`✅ Seeded 12 agents for project ${projectId.slice(0, 8)}`);
}
