// ── Task Create Modal ──────────────────────────────────────

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function TaskCreateModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState(3);
  const [caps, setCaps] = useState("");
  const [error, setError] = useState("");

  const mut = useMutation({
    mutationFn: (body: Record<string, unknown>) => fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["board"] }); qc.invalidateQueries({ queryKey: ["stats"] }); onClose(); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">新建任务</h3>
        <form onSubmit={e => { e.preventDefault(); if (!title.trim()) { setError("标题不能为空"); return; } mut.mutate({ project_id: projectId, title: title.trim(), description: desc, priority, required_capabilities: caps.split(",").map(s => s.trim()).filter(Boolean) }); }} className="space-y-4">
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="任务标题" className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:outline-none" />
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="任务描述（可选）" className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:outline-none resize-none" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">优先级 0-4</label>
              <select value={priority} onChange={e => setPriority(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:outline-none">
                <option value={0}>0 - 紧急</option><option value={1}>1 - 高</option><option value={2}>2 - 中</option><option value={3}>3 - 低</option><option value={4}>4 - 最低</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">能力标签（逗号分隔）</label>
              <input value={caps} onChange={e => setCaps(e.target.value)} placeholder="backend, api" className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 rounded-lg">取消</button>
            <button type="submit" disabled={mut.isPending} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 font-medium">{mut.isPending ? "创建中..." : "创建任务"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
