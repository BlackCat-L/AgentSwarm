// ── Zod validation middleware (simplified) ─────────────────

import type { ZodSchema } from "zod";
import { createMiddleware } from "hono/factory";

/**
 * Validate request body against a Zod schema.
 * Parses body, stores validated data via c.set, or returns 400.
 * Use (c as any).get("validatedBody") to read validated data in handlers.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return createMiddleware(async (c, next) => {
    let raw: unknown;
    try { raw = await c.req.json(); } catch { raw = {}; }

    const result = schema.safeParse(raw);
    if (!result.success) {
      return c.json({
        error: "请求参数校验失败",
        details: result.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      }, 400);
    }

    c.set("validatedBody" as any, result.data);
    await next();
  });
}

/**
 * Validate query parameters against a Zod schema.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return createMiddleware(async (c, next) => {
    const result = schema.safeParse(c.req.query());
    if (!result.success) {
      return c.json({
        error: "查询参数校验失败",
        details: result.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      }, 400);
    }

    c.set("validatedQuery" as any, result.data);
    await next();
  });
}
