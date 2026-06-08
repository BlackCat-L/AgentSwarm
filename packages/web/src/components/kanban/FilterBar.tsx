// ── Filter Bar ─────────────────────────────────────────────

import { useState, useEffect } from "react";

interface Props {
  search: string; onSearchChange: (v: string) => void;
  statusFilter: string[]; onStatusFilterChange: (v: string[]) => void;
  selectedIds: string[]; onBatchDelete: () => void; onClearSelection: () => void;
}

const ALL = ["Backlog","InDev","ReadyForTest","InFix","ReadyForDeploy","Done","Blocked"];

export function FilterBar({ search, onSearchChange, statusFilter, onStatusFilterChange, selectedIds, onBatchDelete, onClearSelection }: Props) {
  const [local, setLocal] = useState(search);
  useEffect(() => { const t = setTimeout(() => onSearchChange(local), 300); return () => clearTimeout(t); }, [local]);

  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <input value={local} onChange={e => setLocal(e.target.value)} placeholder="搜索任务..."
        className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:outline-none w-48" />
      {local && <button onClick={() => setLocal("")} className="text-slate-400 hover:text-slate-600 -ml-2">✕</button>}
      <div className="flex gap-1 flex-wrap">
        {ALL.map(s => (
          <button key={s} onClick={() => statusFilter.includes(s) ? onStatusFilterChange(statusFilter.filter(x => x !== s)) : onStatusFilterChange([...statusFilter, s])}
            className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${statusFilter.includes(s) ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 border border-gray-200 dark:border-slate-700"}`}>{s}</button>
        ))}
      </div>
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-500">{selectedIds.length} selected</span>
          <button onClick={onBatchDelete} className="px-2 py-0.5 text-[10px] bg-red-600 text-white rounded">删除</button>
          <button onClick={onClearSelection} className="px-2 py-0.5 text-[10px] border border-gray-300 rounded">取消</button>
        </div>
      )}
      <div className="ml-auto text-[10px] text-slate-400 space-x-2">
        <span><kbd className="px-1 bg-gray-100 dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-700">N</kbd> 新建</span>
        <span><kbd className="px-1 bg-gray-100 dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-700">/</kbd> 搜索</span>
        <span><kbd className="px-1 bg-gray-100 dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-700">Esc</kbd> 关闭</span>
      </div>
    </div>
  );
}
