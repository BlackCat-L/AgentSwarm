// ── Task Detail Sheet ──────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { TaskNode } from "@agent-swarm/shared";

export function TaskDetailSheet({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [executing, setExecuting] = useState(false);
  const [execOutput, setExecOutput] = useState("");

  const { data: task, isLoading } = useQuery({
    queryKey: ["task", taskId], queryFn: () => fetch(`/api/tasks/${taskId}`).then(r => r.json()) as Promise<TaskNode>,
  });

  const assignMut = useMutation({
    mutationFn: (agentId: string) => fetch(`/api/tasks/${taskId}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent_id: agentId }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["task"] }); qc.invalidateQueries({ queryKey: ["board"] }); },
  });

  const executeMut = useMutation({
    mutationFn: async () => {
      setExecuting(true);
      setExecOutput("");
      const res = await fetch(`/api/tasks/${taskId}/execute`, { method: "POST" });
      const data = await res.json();
      if (data.output) setExecOutput(data.output);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["task"] }); qc.invalidateQueries({ queryKey: ["board"] }); },
    onSettled: () => setExecuting(false),
  });

  const retryMut = useMutation({
    mutationFn: () => fetch(`/api/tasks/${taskId}/retry`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task"] }),
  });

  // Find available agents for assignment
  const { data: agents } = useQuery({
    queryKey: ["agents"], queryFn: () => fetch("/api/agents").then(r => r.json()) as Promise<any[]>,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[520px] max-w-[90vw] bg-white dark:bg-slate-800 border-l border-gray-200 dark:border-slate-700 shadow-xl h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white/90 dark:bg-slate-800/90 backdrop-blur border-b border-gray-200 dark:border-slate-700 p-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">任务详情</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        {isLoading ? <div className="p-4 text-sm text-slate-400">加载中...</div> : !task ? <div className="p-4 text-sm text-red-500">任务不存在</div> : (
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{task.title}</h3>
              <p className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">{task.description || "无描述"}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[["状态", task.status], ["优先级", String(task.priority)], ["重试", `${task.retry_count}/${task.max_retries}`], ["分派人", task.owner_agent_id?.slice(0, 12) || "未分配"]].map(([k, v]) => (
                <div key={k}><div className="text-[10px] text-slate-400 uppercase tracking-wider">{k}</div><div className="text-sm text-slate-700 dark:text-slate-200 truncate">{v}</div></div>
              ))}
            </div>

            {task.required_capabilities.length > 0 && (
              <div><label className="text-xs text-slate-400 mb-1 block">能力需求</label>
                <div className="flex gap-1 flex-wrap">{task.required_capabilities.map(c => <span key={c} className="px-2 py-0.5 bg-gray-100 dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-400">{c}</span>)}</div>
              </div>
            )}

            {task.error_message && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3"><p className="text-sm text-red-600 dark:text-red-400">{task.error_message}</p></div>}

            {/* Exec output — always show if we have it */}
            {executing && <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 animate-pulse"><p className="text-sm text-blue-600 dark:text-blue-400">🚀 执行中...</p></div>}
            {execOutput && <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3"><p className="text-xs font-mono text-emerald-700 dark:text-emerald-400 whitespace-pre-wrap">{execOutput}</p></div>}
            {/* Also show result from task.description for Done tasks */}
            {!execOutput && task.status === "Done" && task.description?.includes("### 执行结果") && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400 whitespace-pre-wrap">{task.description.split("### 执行结果")[1]?.trim()}</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {task.status === "Backlog" && (
                <select onChange={e => { if (e.target.value) assignMut.mutate(e.target.value); }} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg">
                  <option value="">分配 Agent...</option>
                  {(agents || []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
              {task.status === "InDev" && (
                <>
                  <button onClick={() => executeMut.mutate()} disabled={executing}
                    className="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold disabled:opacity-50">
                    {executing ? "执行中..." : "▶ 执行"}
                  </button>
                  <button onClick={() => fetch(`/api/tasks/${taskId}/unassign`, { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: ["task"] }))}
                    className="px-3 py-1.5 text-xs border border-gray-300 dark:border-slate-600 text-slate-500 rounded-lg">释放</button>
                </>
              )}
              {task.status === "InFix" && (
                <button onClick={() => retryMut.mutate()} className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg">重试</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
