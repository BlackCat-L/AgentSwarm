// ── Worktree Manager — Git worktree lifecycle ─────────────

import { execSync } from "node:child_process";
import { existsSync, symlinkSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const WORKTREE_BASE = ".claude/worktrees";
const STALE_DAYS = 30;

export class WorktreeManager {
  constructor(private repoRoot: string) {}

  /** Create an isolated worktree for an agent */
  createWorktree(agentName: string): { path: string; branch: string } {
    const branch = `agent-${agentName}-${Date.now().toString(36)}`;
    const worktreePath = join(this.repoRoot, WORKTREE_BASE, branch);

    try {
      execSync(`git worktree add --detach "${worktreePath}"`, {
        cwd: this.repoRoot, stdio: "pipe", timeout: 30000,
      });
      // Create a branch from the detached HEAD
      execSync(`git checkout -b "${branch}"`, {
        cwd: worktreePath, stdio: "pipe", timeout: 10000,
      });
      this._symlinkNodeModules(worktreePath);
      return { path: worktreePath, branch };
    } catch (err) {
      // Graceful degradation: use temp directory
      const fallbackPath = join(this.repoRoot, WORKTREE_BASE, `fallback-${Date.now().toString(36)}`);
      try { execSync(`mkdir -p "${fallbackPath}"`); } catch { /* ok */ }
      return { path: fallbackPath, branch };
    }
  }

  /** Clean up stale worktrees */
  cleanupStaleWorktrees(): string[] {
    const basePath = join(this.repoRoot, WORKTREE_BASE);
    if (!existsSync(basePath)) return [];

    const cleaned: string[] = [];
    const now = Date.now();
    const cutoff = STALE_DAYS * 86400000;

    try {
      const entries = readdirSync(basePath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = join(basePath, entry.name);
        const stat = statSync(fullPath);
        if (now - stat.mtimeMs > cutoff) {
          try {
            rmSync(fullPath, { recursive: true, force: true });
            // Also remove worktree from git metadata
            execSync(`git worktree prune`, { cwd: this.repoRoot, stdio: "pipe" });
            cleaned.push(entry.name);
          } catch { /* continue */ }
        }
      }
    } catch { /* ok */ }

    return cleaned;
  }

  /** Symlink node_modules to avoid reinstall */
  private _symlinkNodeModules(worktreePath: string): void {
    const nodeModulesPath = join(worktreePath, "node_modules");
    if (existsSync(nodeModulesPath)) return;

    try {
      const mainNodeModules = join(this.repoRoot, "node_modules");
      if (existsSync(mainNodeModules)) {
        if (process.platform === "win32") {
          execSync(`mklink /J "${nodeModulesPath}" "${mainNodeModules}"`, { stdio: "pipe" });
        } else {
          symlinkSync(mainNodeModules, nodeModulesPath, "dir");
        }
      }
    } catch { /* symlink failed, agent will install deps */ }
  }
}
