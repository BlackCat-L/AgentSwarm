// ── Agent Swarm Dark Factory Dashboard ─────────────────────

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Board } from "./components/kanban/Board.js";
import { TaskCreateModal } from "./components/tasks/TaskCreateModal.js";
import { TerminalPanel } from "./components/terminal/TerminalPanel.js";
import { ProjectsPage } from "./pages/Projects.js";

interface ServerStatus { server: string; version: string; db: { currentVersion: number; needsMigration: boolean }; uptime: number; }

export default function App() {
  const [page, setPage] = useState<"dashboard" | "projects">("dashboard");
  const [showCreate, setShowCreate] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const { data: status } = useQuery<ServerStatus>({
    queryKey: ["status"], queryFn: () => fetch("/api/status").then(r => r.json()), refetchInterval: 10000,
  });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => fetch("/api/projects").then(r => r.json()) as Promise<any[]> });
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const activeProjectId = selectedProjectId || projects?.[0]?.id || "";

  const { data: agents } = useQuery({
    queryKey: ["agents", activeProjectId],
    queryFn: () => fetch(`/api/agents?project_id=${activeProjectId}`).then(r => r.json()) as Promise<any[]>,
    refetchInterval: 10000,
    enabled: !!activeProjectId,
  });
  const { data: stats } = useQuery({
    queryKey: ["stats", activeProjectId],
    queryFn: () => fetch(`/api/stats?projectId=${activeProjectId}`).then(r => r.json()),
    refetchInterval: 10000,
    enabled: !!activeProjectId,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) setShowCreate(true);
      if (e.key === "Escape") setShowCreate(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (page === "projects") return <ProjectsPage />;

  const card = "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-50 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-blue-600 dark:text-blue-400 font-bold text-lg">⬛</div>
            <h1 className="text-slate-800 dark:text-slate-100 font-semibold text-lg">
              Agent Swarm <span className="text-slate-400 font-normal">控制台</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setPage(p => p === "dashboard" ? "projects" : "dashboard")}
              className="text-xs text-slate-500 hover:text-blue-600 dark:hover:text-blue-400">
              {page === "dashboard" ? "项目管理" : "看板"}
            </button>
            <button onClick={() => setDark(!dark)}
              className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700"
              title={dark ? "切换亮色" : "切换暗色"}>
              {dark ? "☀" : "☾"}
            </button>
            {activeProjectId && (
              <button onClick={() => setShowCreate(true)}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                N 新建任务
              </button>
            )}
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400`}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />在线
            </span>
            <span className="text-xs text-slate-400">v{status?.version ?? "0"}</span>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            ["总任务", String(stats?.total ?? "—")],
            ["已完成", String(stats?.done ?? "—")],
            ["活跃 Agent", String(agents?.filter((a: any) => a.status === "busy").length ?? "—")],
            ["完成率", stats?.completionRate ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className={card + " p-4 text-center"}>
              <div className="text-2xl font-mono font-bold text-blue-600 dark:text-blue-400">{value}</div>
              <div className="text-xs text-slate-500 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Agent Status */}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Agent 团队</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {(agents || []).map((a: any) => (
              <div key={a.id} className={card + " p-3 hover:border-blue-300 dark:hover:border-slate-600 transition-colors"}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-blue-600 dark:text-blue-400 text-sm font-medium">{a.name}</span>
                  <div className={`w-2 h-2 rounded-full ${a.status === "busy" ? "bg-blue-500 agent-dot-busy" : a.status === "idle" ? "bg-gray-400" : a.status === "error" ? "bg-red-500" : "bg-gray-300"}`} />
                </div>
                <div className="text-xs text-slate-500">{a.role} · {a.runtime} · {a.model}</div>
              </div>
            ))}
            {(!agents || agents.length === 0) && (
              <div className="col-span-full text-center py-8 text-sm text-slate-400">
                暂无 Agent — 通过 API 或 CLI 注册第一个 Agent
              </div>
            )}
          </div>
        </section>

        {/* Kanban */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">看板</h2>
            {(projects?.length ?? 0) > 1 && (
              <select value={activeProjectId} onChange={e => setSelectedProjectId(e.target.value)}
                className="text-xs border border-gray-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <option value="">全部项目</option>
                {projects?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
          {activeProjectId ? <Board projectId={activeProjectId} /> : (
            <div className={card + " p-8 text-center text-sm text-slate-400"}>
              创建项目和 Agent 后看板将在此显示
            </div>
          )}
        </section>
      </main>

      {showCreate && activeProjectId && <TaskCreateModal projectId={activeProjectId} onClose={() => setShowCreate(false)} />}
      <TerminalPanel agents={(agents || []).map((a: any) => ({ id: a.id, name: a.name, status: a.status }))} />
    </div>
  );
}
