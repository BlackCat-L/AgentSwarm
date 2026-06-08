// ── SSE Handler — Hono stream-based Server-Sent Events ─────

import type { Context } from "hono";
import { eventBus } from "./event-bus.js";

export interface SSESubscriber {
  send(event: { event: string; data: string; timestamp: string }): void;
}

/** GET /api/events?projectId=xxx — SSE stream */
export function sseHandler(c: Context) {
  const projectId = c.req.query("projectId") || "default";

  return c.body(
    new ReadableStream({
      start(controller) {
        const subscriber: SSESubscriber = {
          send({ event, data, timestamp }) {
            const msg = `event: ${event}\ndata: ${data}\nid: ${timestamp}\n\n`;
            controller.enqueue(new TextEncoder().encode(msg));
          },
        };

        // Send initial connected event
        const connected = `event: connected\ndata: {"projectId":"${projectId}"}\n\n`;
        controller.enqueue(new TextEncoder().encode(connected));

        eventBus.subscribe(projectId, subscriber);

        // Heartbeat every 15s
        const heartbeat = setInterval(() => {
          try {
            const hb = `: heartbeat ${new Date().toISOString()}\n\n`;
            controller.enqueue(new TextEncoder().encode(hb));
          } catch {
            clearInterval(heartbeat);
            eventBus.unsubscribe(projectId, subscriber);
          }
        }, 15000);

        // Cleanup on close
        c.req.raw.signal?.addEventListener("abort", () => {
          clearInterval(heartbeat);
          eventBus.unsubscribe(projectId, subscriber);
          try { controller.close(); } catch { /* ok */ }
        });
      },
    }),
    200,
    {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    }
  );
}
