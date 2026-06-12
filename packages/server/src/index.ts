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

server = serve({ fetch: app.fetch, port: PORT });
console.log(`⬛ Agent Swarm Dark Factory → http://localhost:${PORT}`);
