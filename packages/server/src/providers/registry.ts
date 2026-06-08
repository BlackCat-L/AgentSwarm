// ── Provider Registry — registration + auto-fallback ───────

import type { AgentProvider, ProviderAvailability } from "./types.js";
import { claudeSdkProvider } from "./claude-sdk.js";
import { claudeCliProvider } from "./claude-cli.js";
import { hermesProvider } from "./hermes.js";
import { openclawProvider } from "./openclaw.js";

export class ProviderRegistry {
  private providers = new Map<string, AgentProvider>();
  private availability = new Map<string, ProviderAvailability>();

  constructor() {
    this.register(claudeSdkProvider);
    this.register(claudeCliProvider);
    this.register(hermesProvider);
    this.register(openclawProvider);
  }

  /** Register a provider */
  register(provider: AgentProvider): void {
    this.providers.set(provider.name, provider);
  }

  /** Get a specific provider by name */
  getProvider(name: string): AgentProvider | undefined {
    return this.providers.get(name);
  }

  /** Get all registered providers */
  getAll(): AgentProvider[] {
    return [...this.providers.values()];
  }

  /** Detect all providers asynchronously */
  async detectAll(): Promise<Map<string, ProviderAvailability>> {
    await Promise.all(
      [...this.providers.entries()].map(async ([name, provider]) => {
        this.availability.set(name, await provider.checkAvailability());
      })
    );
    return this.availability;
  }

  /** Get availability for a specific provider */
  getAvailability(name: string): ProviderAvailability | undefined {
    return this.availability.get(name);
  }

  /**
   * Resolve the best available provider for a runtime.
   * Priority: SDK → CLI fallback
   */
  async resolveProvider(): Promise<{ provider: AgentProvider; fallback: boolean } | null> {
    await this.detectAll();

    // Try SDK first
    const sdkAvail = this.availability.get("claude-code");
    if (sdkAvail?.status === "ready") {
      return { provider: this.providers.get("claude-code")!, fallback: false };
    }

    // Fallback to CLI
    const cliAvail = this.availability.get("claude-cli");
    if (cliAvail?.status === "ready") {
      return { provider: this.providers.get("claude-cli")!, fallback: true };
    }

    return null;
  }
}
