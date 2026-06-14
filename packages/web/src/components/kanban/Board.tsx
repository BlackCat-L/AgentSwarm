// ── Kanban Board — 7-column drag-and-drop ─────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragOverlay, closestCorners, type DragEndEvent } from "@dnd-kit/core";
import { useState, useMemo } from "react";
import { Column } from "./Column.js";
import { Card } from "./Card.js";
import { FilterBar } from "./FilterBar.js";
import { TaskDetailSheet } from "../tasks/TaskDetailSheet.js";
import type { TaskNode, TaskStatus } from "@agent-swarm/shared";

const COLUMNS: TaskStatus[] = ["Backlog","InDev","ReadyForTest","InFix","ReadyForDeploy","Done","Blocked"];
const COLUMN_COLORS: Record<string, string> = { Backlog: "bg-gray-400", InDev: "bg-blue-500", ReadyForTest: "bg-sky-400", InFix: "bg-amber-400", ReadyForDeploy: "bg-purple-400", Done: "bg-emerald-500", Blocked: "bg-red-500" };
const COLUMN_LABELS: Record<string, string> = { Backlog: "待办", InDev: "开发中", ReadyForTest: "待测试", InFix: "修复中", ReadyForDeploy: "待部署", Done: "完成", Blocked: "阻塞" };

interface Props { projectId: string }

export function Board({ projectId }: Props) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const { data: board } = useQuery({
    queryKey: ["board", projectId],
    queryFn: () => fetch(`/api/board?projectId=${projectId}`).then(r => r.json()) as Promise<{ columns: { status: TaskStatus; tasks: TaskNode[] }[] }>,
    refetchInterval: 5000,
  });

  const { data: agents } = useQuery({
    queryKey: ["agents", "all"], // fetch all agents — cross-project assignments need full map
    queryFn: () => fetch(`/api/agents`).then(r => r.json()) as Promise<any[]>,
    refetchInterval: 15000,
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    (agents || []).forEach((a: any) => m.set(a.id, a.name));
    return m;
  }, [agents]);

  const moveMut = useMutation({
    mutationFn: async ({ taskId, newStatus, version }: { taskId: string; newStatus: TaskStatus; version: number }) => {
      const res = await fetch(`/api/tasks/${taskId}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus, version }) });
      if (!res.ok) throw new Error("状态流转失败");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board"] }),
  });

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const task = board?.columns.flatMap(c => c.tasks).find(t => t.id === active.id);
    if (!task || task.status === over.id) return;
    moveMut.mutate({ taskId: active.id as string, newStatus: over.id as TaskStatus, version: task.version });
  }

  const rawColumns = board?.columns ?? COLUMNS.map(s => ({ status: s, title: s, tasks: [] as TaskNode[] }));
  const filtered = useMemo(() => rawColumns.map(col => ({
    ...col,
    tasks: col.tasks.filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.description?.toLowerCase().includes(search.toLowerCase())) return false;
      return statusFilter.length === 0 || statusFilter.includes(t.status);
    }),
  })), [rawColumns, search, statusFilter]);

  const activeTask = rawColumns.flatMap(c => c.tasks).find(t => t.id === activeId);

  return (
    <DndContext collisionDetection={closestCorners} onDragStart={e => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
      <FilterBar search={search} onSearchChange={setSearch} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
        selectedIds={[]} onBatchDelete={() => {}} onClearSelection={() => {}} />
      <div className="grid grid-cols-7 gap-3 min-h-[400px]">
        {filtered.map(col => (
          <Column key={col.status} status={col.status} label={COLUMN_LABELS[col.status]!} color={COLUMN_COLORS[col.status]!} tasks={col.tasks} onTaskClick={setDetailId} agentMap={agentMap} />
        ))}
      </div>
      <DragOverlay>{activeTask ? <Card task={activeTask} isOverlay /> : null}</DragOverlay>
      {detailId && <TaskDetailSheet taskId={detailId} onClose={() => setDetailId(null)} />}
    </DndContext>
  );
}
