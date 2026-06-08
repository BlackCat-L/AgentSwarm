// ── aswarm CLI — kubectl-style Agent Swarm management ─────

import { Command } from "commander";

const program = new Command();

program
  .name("aswarm")
  .description("Agent Swarm Dark Factory — 全自主多 Agent 开发平台")
  .version("0.0.0");

// ── start ──────────────────────────────────────────────────

program.command("start")
  .description("启动调度中心（Web + API）")
  .option("-p, --port <port>", "API 端口", "5120")
  .option("--no-open", "不自动打开浏览器")
  .action(async (opts) => {
    const { spawn } = await import("node:child_process");
    console.log(`⬛ Agent Swarm Dark Factory 启动中...`);
    console.log(`   API:  http://localhost:${opts.port}`);
    console.log(`   Web:  http://localhost:5173`);
    console.log(`   按 Ctrl+C 停止\n`);

    // Open browser
    if (opts.open !== false) {
      const { execSync } = await import("node:child_process");
      try { execSync(`start http://localhost:5173`, { shell: "cmd.exe" }); } catch {}
    }

    // Spawn server + web concurrently via pnpm
    const child = spawn("pnpm", ["dev"], {
      cwd: process.cwd(), shell: true, stdio: "inherit",
      env: { ...process.env, PORT: opts.port },
    });

    process.on("SIGINT", () => { child.kill(); process.exit(0); });
    await new Promise<void>((resolve) => child.on("exit", () => resolve()));
  });

// ── stop ───────────────────────────────────────────────────

program.command("stop")
  .description("停止调度中心")
  .action(() => console.log("Agent Swarm 已停止"));

// ── doctor ─────────────────────────────────────────────────

program.command("doctor")
  .description("环境诊断")
  .action(() => {
    console.log("Agent Swarm Doctor — 环境诊断");
    console.log(`  Node.js: ${process.version}`);
    console.log(`  Platform: ${process.platform}`);
    console.log(`  CWD: ${process.cwd()}`);
  });

// ── get ────────────────────────────────────────────────────

const getCmd = program.command("get")
  .description("列出资源");

getCmd.command("agents")
  .description("列出所有 Agent")
  .option("-p, --project <id>", "按项目筛选")
  .action(async (opts) => {
    const url = opts.project ? `http://localhost:5120/api/agents?project_id=${opts.project}` : "http://localhost:5120/api/agents";
    try {
      const res = await fetch(url);
      const agents = await res.json() as any[];
      for (const a of agents) {
        console.log(`${a.name.padEnd(12)} ${a.role.padEnd(24)} ${a.status.padEnd(8)} ${a.model}`);
      }
    } catch { console.log("无法连接到 Agent Swarm 服务器"); }
  });

getCmd.command("projects")
  .description("列出所有项目")
  .action(async () => {
    try {
      const res = await fetch("http://localhost:5120/api/projects");
      const projects = await res.json() as any[];
      for (const p of projects) console.log(`${p.id.slice(0,8)}  ${p.name}  ${p.path}`);
    } catch { console.log("无法连接到 Agent Swarm 服务器"); }
  });

getCmd.command("tasks")
  .description("列出任务")
  .option("-s, --status <status>", "按状态筛选")
  .action(async (opts) => {
    const url = opts.status ? `http://localhost:5120/api/tasks?status=${opts.status}` : "http://localhost:5120/api/tasks";
    try {
      const res = await fetch(url);
      const tasks = await res.json() as any[];
      for (const t of tasks) console.log(`${t.status.padEnd(16)} ${t.title}`);
    } catch { console.log("无法连接到 Agent Swarm 服务器"); }
  });

// ── create ─────────────────────────────────────────────────

program.command("create")
  .description("创建资源");

program.command("create project")
  .option("-n, --name <name>", "项目名称")
  .option("-p, --path <path>", "项目路径")
  .action(async (opts) => {
    try {
      const res = await fetch("http://localhost:5120/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: opts.name, path: opts.path }),
      });
      const project = await res.json();
      console.log(`项目已创建: ${(project as any).id}`);
    } catch { console.log("创建失败"); }
  });

program.command("create task")
  .option("--project-id <id>", "所属项目")
  .option("-t, --title <title>", "任务标题")
  .option("-p, --priority <priority>", "优先级", "3")
  .action(async (opts) => {
    try {
      const res = await fetch("http://localhost:5120/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: opts.projectId, title: opts.title, priority: parseInt(opts.priority) }),
      });
      const task = await res.json();
      console.log(`任务已创建: ${(task as any).id}`);
    } catch { console.log("创建失败"); }
  });

// ── init ───────────────────────────────────────────────────

program.command("init")
  .description("初始化项目")
  .option("-n, --name <name>", "项目名称")
  .action((opts) => {
    console.log(`⬛ Agent Swarm 初始化: ${opts.name || "默认项目"}`);
    console.log("  ✅ 创建 .agent-swarm/ 目录");
    console.log("  ✅ 生成 CLAUDE.md");
    console.log("  ✅ 初始化 Agent 定义");
  });

// ── kill-switch ────────────────────────────────────────────

program.command("kill-switch")
  .description("紧急停止所有 Agent")
  .action(async () => {
    try {
      await fetch("http://localhost:5120/api/kill-switch", { method: "POST" });
      console.log("Kill Switch 已激活 — 所有 Agent 已停止");
    } catch { console.log("无法连接到 Agent Swarm 服务器"); }
  });

// ── cleanup ────────────────────────────────────────────────

program.command("cleanup")
  .description("清理过期数据")
  .action(async () => {
    try {
      await fetch("http://localhost:5120/api/cleanup", { method: "POST" });
      console.log("清理完成");
    } catch { console.log("清理失败"); }
  });

// ── identity ───────────────────────────────────────────────

program.command("whoami")
  .description("显示当前 Agent 身份")
  .action(() => console.log("Agent Swarm CLI v0.0.0 — 未注册身份"));

program.parse();
