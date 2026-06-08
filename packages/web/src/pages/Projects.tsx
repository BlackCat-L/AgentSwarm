// ── Projects Page ──────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export function ProjectsPage() {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [name, setName] = useState(""); const [path, setPath] = useState("");
  const [err, setErr] = useState("");

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"], queryFn: () => fetch("/api/projects").then(r => r.json()), refetchInterval: 10000,
  });
  const createMut = useMutation({
    mutationFn: (b: { name: string; path: string }) => fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setShow(false); setName(""); setPath(""); },
    onError: (e: Error) => setErr(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => fetch(`/api/projects/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
      <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">项目管理</h1>
        <div className="flex gap-2">
          <a href="/" className="px-3 py-1.5 text-xs border border-gray-200 dark:border-slate-700 text-slate-500 hover:text-blue-600 rounded-lg">← 看板</a>
          <button onClick={() => setShow(true)} className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg">新建项目</button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        {isLoading ? <p className="text-slate-400">加载中...</p> : (
          <div className="space-y-2">
            {(projects || []).map((p: any) => (
              <div key={p.id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-4 flex items-center justify-between hover:border-blue-300 dark:hover:border-slate-600">
                <div>
                  <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">{p.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{p.path}</p>
                </div>
                <button onClick={() => { if (confirm("删除项目将级联删除所有数据，确定？")) deleteMut.mutate(p.id); }}
                  className="px-2 py-1 text-[10px] border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">删除</button>
              </div>
            ))}
            {(!projects || projects.length === 0) && <p className="text-slate-400 text-sm text-center py-8">暂无项目</p>}
          </div>
        )}
      </main>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={e => { if (e.target === e.currentTarget) setShow(false); }}>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">新建项目</h3>
            <div className="space-y-3">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="项目名称" className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              <input value={path} onChange={e => setPath(e.target.value)} placeholder="项目路径" className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              {err && <p className="text-sm text-red-500">{err}</p>}
              <div className="flex justify-end gap-3">
                <button onClick={() => setShow(false)} className="px-3 py-1.5 text-sm text-slate-500">取消</button>
                <button onClick={() => createMut.mutate({ name: name.trim() || "新项目", path: path.trim() || `/tmp/project-${Date.now()}` })}
                  className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">创建</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
