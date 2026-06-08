// ============================================================
// RuntimeCircuitBreaker — failure-based auto-protection
// 3 consecutive failures → OPEN (5 min) → HALF_OPEN → CLOSED
// Reference: PRD §0.8 断路器保护策略
// ============================================================

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitEntry {
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureAt: string | null;
  openedAt: string | null;
}

const FAILURE_THRESHOLD = 3;
const SUCCESS_THRESHOLD = 2;
const OPEN_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export class RuntimeCircuitBreaker {
  private circuits = new Map<string, CircuitEntry>();

  /** Check if a runtime can dispatch (CLOSED or HALF_OPEN) */
  canDispatch(runtime: string): boolean {
    const entry = this._ensure(runtime);

    if (entry.state === "OPEN") {
      // Check if enough time has passed to transition to HALF_OPEN
      if (entry.openedAt) {
        const elapsed = Date.now() - new Date(entry.openedAt).getTime();
        if (elapsed >= OPEN_DURATION_MS) {
          entry.state = "HALF_OPEN";
          entry.consecutiveSuccesses = 0;
          return true; // Allow one probe request
        }
      }
      return false;
    }

    return true; // CLOSED or HALF_OPEN
  }

  /** Record a successful operation */
  onSuccess(runtime: string): void {
    const entry = this._ensure(runtime);

    if (entry.state === "HALF_OPEN") {
      entry.consecutiveSuccesses++;
      if (entry.consecutiveSuccesses >= SUCCESS_THRESHOLD) {
        // Transition to CLOSED
        entry.state = "CLOSED";
        entry.consecutiveFailures = 0;
        entry.consecutiveSuccesses = 0;
      }
    } else {
      // CLOSED state — reset failure count
      entry.consecutiveFailures = 0;
    }
  }

  /** Record a failure */
  onFailure(runtime: string): void {
    const entry = this._ensure(runtime);
    entry.consecutiveFailures++;
    entry.lastFailureAt = new Date().toISOString();

    if (entry.consecutiveFailures >= FAILURE_THRESHOLD && entry.state !== "OPEN") {
      // Trip the breaker
      entry.state = "OPEN";
      entry.openedAt = new Date().toISOString();
      entry.consecutiveSuccesses = 0;
    }
  }

  /** Get the current state of a circuit */
  getState(runtime: string): CircuitState {
    return this._ensure(runtime).state;
  }

  /** Get failure count for diagnostics */
  getFailureCount(runtime: string): number {
    return this._ensure(runtime).consecutiveFailures;
  }

  /** Manually reset a circuit to CLOSED (admin intervention) */
  reset(runtime: string): void {
    this.circuits.set(runtime, {
      state: "CLOSED",
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastFailureAt: null,
      openedAt: null,
    });
  }

  /** Reset all circuits */
  resetAll(): void {
    this.circuits.clear();
  }

  private _ensure(runtime: string): CircuitEntry {
    if (!this.circuits.has(runtime)) {
      this.circuits.set(runtime, {
        state: "CLOSED",
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastFailureAt: null,
        openedAt: null,
      });
    }
    return this.circuits.get(runtime)!;
  }
}
