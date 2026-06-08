// ── Claude Code SDK Provider (primary) ─────────────────────
// Wraps @anthropic-ai/claude-agent-sdk query() AsyncGenerator

import type { AgentProvider, ExecuteOpts, ProviderAvailability, RuntimeModel } from "./types.js";

export const claudeSdkProvider: AgentProvider = {
  name: "claude-code",
  label: "Claude Code (SDK)",

  async checkAvailability(): Promise<ProviderAvailability> {
    try {
      await import("@anthropic-ai/claude-agent-sdk");
      return { status: "ready" };
    } catch (err) {
      return { status: "unavailable", detail: `SDK not available: ${(err as Error).message}` };
    }
  },

  async listModels(): Promise<RuntimeModel[]> {
    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      const q = query({ prompt: "", options: { cwd: process.cwd(), permissionMode: "bypassPermissions" as any } });
      try {
        const models = await q.supportedModels();
        return models.map((m: any) => ({
          id: m.value, name: m.displayName, description: m.description,
          supports: { effort: m.supportsEffort ?? false, adaptive_thinking: m.supportsAdaptiveThinking ?? false, fast_mode: m.supportsFastMode ?? false, auto_mode: m.supportsAutoMode ?? false },
        }));
      } finally { q.close(); }
    } catch {
      return [{ id: "sonnet", name: "Claude Sonnet", supports: { effort: false, adaptive_thinking: false, fast_mode: false, auto_mode: false } }];
    }
  },

  async execute(opts: ExecuteOpts) {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const q = query({
      prompt: opts.prompt,
      options: {
        sessionId: opts.resume ? undefined : opts.sessionId,
        resume: opts.resume ? opts.sessionId : undefined,
        cwd: opts.cwd,
        env: opts.env as any,
        model: opts.model as any,
        permissionMode: "bypassPermissions" as any,
        includePartialMessages: true,
      },
    });

    const events = (async function* () {
      for await (const msg of q) {
        // Map SDK message → AgentOutputEvent
        if (msg.type === "assistant") {
          const blocks = (msg as any).message?.content ?? [];
          for (const b of blocks) {
            if (b.type === "text" && b.text) yield { type: "assistant" as const, content: b.text };
            else if (b.type === "tool_use") yield { type: "tool_use" as const, toolName: b.name, toolId: b.id, input: b.input };
            else if (b.type === "thinking" && b.thinking) yield { type: "thinking" as const, content: b.thinking };
          }
        } else if (msg.type === "user") {
          const content = (msg as any).message?.content;
          if (Array.isArray(content)) {
            for (const b of content) {
              if (b.type === "tool_result") {
                yield { type: "tool_result" as const, toolUseId: b.tool_use_id, content: typeof b.content === "string" ? b.content : JSON.stringify(b.content), isError: b.is_error ?? false };
              }
            }
          }
        } else if (msg.type === "result") {
          yield { type: "completed" as const, stopReason: (msg as any).subtype ?? "end_turn" };
          break;
        } else if (msg.type === "rate_limit_event") {
          yield { type: "turn_rate_limit" as const, status: (msg as any).rate_limit_info?.status ?? "rejected" };
        }
      }
      q.close();
    })();

    return {
      events,
      abort: async () => { q.close(); },
      send: async (_message: string) => {
        // Not supported in SDK query mode
      },
    };
  },
};
