// ── Kanban Card ────────────────────────────────────────────

import { useDraggable } from "@dnd-kit/core";
import type { TaskNode } from "@agent-swarm/shared";

interface Props { task: TaskNode; isOverlay?: boolean; onClick?: () => void }

export function Card({ task, isOverlay, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  const pri = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-blue-500", "bg-gray-400"];

  return (
    <div ref={setNodeRef} style={style} className={`bg-white dark:bg-slate-800 border rounded-lg transition-all select-none
        ${isDragging ? "opacity-50" : ""}
        ${isOverlay ? "shadow-lg shadow-blue-500/20 border-blue-400 rotate-2" : "border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-slate-600"}
        ${task.owner_agent_id ? "border-l-2 border-l-blue-500 shadow-sm" : ""}`}>
      <div {...listeners} {...attributes} className="p-3 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-1.5 h-1.5 rounded-full ${pri[task.priority] ?? "bg-gray-400"}`} />
          <span className="text-sm text-slate-700 dark:text-slate-200 font-medium truncate">{task.title}</span>
        </div>
        {task.description && <p className="text-xs text-slate-500 truncate mt-1">{task.description}</p>}
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
          {task.owner_agent_id && <span className="font-mono text-blue-600 text-[10px]">{task.owner_agent_id.slice(0, 8)}</span>}
          {task.required_capabilities.map(c => <span key={c} className="px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded text-[10px]">{c}</span>)}
          {task.retry_count > 0 && <span className="text-amber-500">{task.retry_count}/{task.max_retries}</span>}
        </div>
      </div>
      <button onClick={e => { e.stopPropagation(); onClick?.(); }}
        className="w-full px-3 py-1 text-[10px] text-slate-400 hover:text-blue-600 border-t border-gray-100 dark:border-slate-700 text-left">
        查看详情 →
      </button>
    </div>
  );
}
