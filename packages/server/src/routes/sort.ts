// ── Sorting visualisation API ─────────────────────────────

import { Hono } from "hono";
import { runSortService } from "../utils/sort.js";

const sortRouter = new Hono();

/**
 * POST /api/sort
 *
 * Body (optional):
 *   count  — number of elements (default 10, min 2, max 100)
 *   min    — minimum random value (default 0)
 *   max    — maximum random value (default 100)
 *
 * Returns:
 *   original    — the generated unsorted list
 *   descending  — { sorted, steps[] }  each step: { array, i, j, swapped, phase }
 *   ascending   — { sorted, steps[] }
 */
sortRouter.post("/", (c) => {
  const { count, min, max } = c.req.queries();
  const countNum = Math.min(100, Math.max(2, parseInt(count?.[0] ?? "10", 10)));
  const minNum = parseInt(min?.[0] ?? "0", 10);
  const maxNum = parseInt(max?.[0] ?? "100", 10);

  try {
    const result = runSortService(countNum, minNum, maxNum);
    return c.json(result);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

/**
 * GET /api/sort?count=10&min=0&max=100
 * Same as POST but via query params.
 */
sortRouter.get("/", (c) => {
  const count = Math.min(100, Math.max(2, parseInt(c.req.query("count") ?? "10", 10)));
  const min = parseInt(c.req.query("min") ?? "0", 10);
  const max = parseInt(c.req.query("max") ?? "100", 10);

  try {
    const result = runSortService(count, min, max);
    return c.json(result);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

export default sortRouter;
