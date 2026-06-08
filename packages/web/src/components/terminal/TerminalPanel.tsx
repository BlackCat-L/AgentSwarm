// ── Terminal Panel ─────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";

interface AgentInfo { id: string; name: string; status: string }

export function TerminalPanel({ agents }: { agents: AgentInfo[] }) {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const termRef = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!termRef.current || collapsed || !activeAgent) return;
    const t = new Terminal({
      theme: { background: "#1E293B", foreground: "#CBD5E1", cursor: "#3B82F6" },
      fontSize: 13, fontFamily: '"JetBrains Mono", monospace', cursorBlink: true,
    });
    const fit = new FitAddon(); t.loadAddon(fit);
    t.open(termRef.current); fit.fit();
    t.writeln("⬛ Agent Swarm Terminal");
    term.current = t;
    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); t.dispose(); };
  }, [activeAgent, collapsed]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      {collapsed ? (
        <button onClick={() => setCollapsed(false)}
          className="w-full bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 py-1.5 text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-mono">
          ▲ Terminal
        </button>
      ) : (
        <div className="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700">
          <div className="flex items-center bg-gray-50 dark:bg-slate-900 px-2 overflow-x-auto">
            <div className="flex items-center gap-0.5 py-1">
              {agents.map(a => (
                <button key={a.id} onClick={() => setActiveAgent(a.id)}
                  className={`px-3 py-1 text-xs font-mono rounded-t transition-colors whitespace-nowrap
                    ${activeAgent === a.id ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-t border-x border-gray-200 dark:border-slate-700" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>
                  {a.name}
                  <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${a.status === "busy" ? "bg-blue-500 agent-dot-busy" : "bg-gray-400"}`} />
                </button>
              ))}
            </div>
            <button onClick={() => setCollapsed(true)} className="ml-auto px-2 py-1 text-xs text-slate-400 hover:text-slate-600 font-mono">▼</button>
          </div>
          {activeAgent ? <div ref={termRef} className="h-48" /> : <div className="h-48 flex items-center justify-center text-xs text-slate-400">选择 Agent 查看终端输出</div>}
        </div>
      )}
    </div>
  );
}
