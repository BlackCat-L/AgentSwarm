// ── Kanban Column — droppable ──────────────────────────────

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Card } from "./Card.js";
import type { TaskNode, TaskStatus } from "@agent-swarm/shared";

interface Props { status: TaskStatus; label: string; color: string; tasks: TaskNode[]; onTaskClick?: (id: string) => void; agentMap?: Map<string, string> }

export function Column({ status, label, color, tasks, onTaskClick, agentMap }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div ref={setNodeRef}
      className={`bg-gray-50 dark:bg-slate-800/50 border rounded-lg p-3 min-h-[200px] transition-colors
        ${isOver ? "border-blue-400 bg-blue-50 dark:bg-slate-700" : "border-gray-200 dark:border-slate-700"}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        <span className="ml-auto text-xs bg-gray-200 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {tasks.map(t => <Card key={t.id} task={t} onClick={() => onTaskClick?.(t.id)} agentName={agentMap?.get(t.owner_agent_id || "")} />)}
          {tasks.length === 0 && <div className="text-xs text-slate-400 text-center py-4">暂无</div>}
        </div>
      </SortableContext>
    </div>
  );
}
