// ── Agent Swarm Dark Factory — HTTP Server Entry ──────────

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { initDb, closeDb } from "./db/connection.js";
import { migrate } from "./db/migrate.js";
import { seed } from "./db/seed.js";
import { errorHandler } from "./middleware/error.js";
import routes from "./routes/index.js";

const PORT = parseInt(process.env.PORT || "5120", 10);

// ── Bootstrap ──────────────────────────────────────────────
await initDb();
migrate();
seed();

const app = new Hono();

// ── Global middleware ──────────────────────────────────────

// Charset fix — ensure all JSON responses use UTF-8
app.use("/*", async (c, next) => {
  await next();
  const ct = c.res.headers.get("Content-Type");
  if (ct?.includes("application/json") && !ct.includes("charset")) {
    c.res.headers.set("Content-Type", "application/json; charset=utf-8");
  }
});

app.use(
  "/*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:5120"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.onError(errorHandler);

// ── API routes ─────────────────────────────────────────────
app.route("/api", routes);

// ── Start ──────────────────────────────────────────────────
let server: ReturnType<typeof serve>;

function shutdown() {
  console.log("\n🛑 Shutting down...");
  if (server) server.close();
  closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Listen for EADDRINUSE on the underlying http.Server
function startWithRecovery(port: number, maxRetries = 3): ReturnType<typeof serve> {
  const s = serve({ fetch: app.fetch, port });

  // @hono/node-server's serve() returns an object whose underlying
  // http.Server emits 'error' for EADDRINUSE. Hook it via the server's
  // address() — if it failed, address() is null.
  const raw: any = (s as any).server ?? (s as any)._server;
  if (raw?.on) {
    raw.on("error", async (err: NodeJS.ErrnoException) => {
      if (err.code !== "EADDRINUSE") throw err;

      console.log(`⚠️  Port ${port} is in use. Trying to recover...`);

      // Auto-kill stale process
      const { execSync } = await import("node:child_process");
      try {
        if (process.platform === "win32") {
          execSync(`powershell -Command "Get-NetTCPConnection -LocalPort ${port} -EA SilentlyContinue | ForEach-Object { Stop-Process -Id (Get-Process -Id \\$_.OwningProcess -EA SilentlyContinue).Id -Force -EA SilentlyContinue }"`, { timeout: 5000, stdio: "pipe" });
        } else {
          execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null; true`, { timeout: 5000, stdio: "pipe" });
        }
        console.log(`   Killed old process on port ${port}`);
      } catch {
        console.log(`   Could not auto-kill. Close it manually:`);
        console.log(`   Windows: netstat -ano | findstr ":${port}" → taskkill /pid <PID> /f`);
        console.log(`   Mac/Linux: lsof -ti:${port} | xargs kill -9`);
      }

      // Retry after a short wait
      const { setTimeout } = await import("node:timers/promises");
      let retries = 0;
      while (retries < maxRetries) {
        await setTimeout(2000);
        try {
          const s2 = serve({ fetch: app.fetch, port });
          console.log(`✅ Recovered! Server running on port ${port}`);
          server = s2;
          return;
        } catch {
          retries++;
        }
      }
      console.error(`❌ Could not recover after ${maxRetries} retries. Exiting.`);
      process.exit(1);
    });
  }

  return s;
}

server = startWithRecovery(PORT);
console.log(`⬛ Agent Swarm Dark Factory → http://localhost:${PORT}`);
