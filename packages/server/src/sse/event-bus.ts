// ── SSE Event Bus — publish / subscribe pattern ────────────

import type { SSESubscriber } from "./handler.js";

export class EventBus {
  private subscribers = new Map<string, Set<SSESubscriber>>();

  /** Subscribe to events for a project */
  subscribe(projectId: string, subscriber: SSESubscriber): void {
    if (!this.subscribers.has(projectId)) {
      this.subscribers.set(projectId, new Set());
    }
    this.subscribers.get(projectId)!.add(subscriber);
  }

  /** Unsubscribe */
  unsubscribe(projectId: string, subscriber: SSESubscriber): void {
    this.subscribers.get(projectId)?.delete(subscriber);
    if (this.subscribers.get(projectId)?.size === 0) {
      this.subscribers.delete(projectId);
    }
  }

  /** Publish event to all subscribers of a project */
  publish(projectId: string, eventType: string, data: unknown): void {
    const subs = this.subscribers.get(projectId);
    if (!subs) return;

    const payload = {
      event: eventType,
      data: JSON.stringify(data),
      timestamp: new Date().toISOString(),
    };

    for (const sub of subs) {
      try {
        sub.send(payload);
      } catch {
        this.unsubscribe(projectId, sub);
      }
    }
  }

  /** Broadcast to ALL projects */
  broadcast(eventType: string, data: unknown): void {
    for (const projectId of this.subscribers.keys()) {
      this.publish(projectId, eventType, data);
    }
  }

  /** Get subscriber count */
  get subscriberCount(): number {
    let count = 0;
    for (const subs of this.subscribers.values()) count += subs.size;
    return count;
  }
}

// Singleton instance
export const eventBus = new EventBus();
