// ── Global error handling middleware ───────────────────────

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

export async function errorHandler(err: Error, c: Context) {
  // Zod validation errors (thrown by our validate middleware)
  if (err.name === "ZodError") {
    return c.json(
      { error: "请求参数校验失败", details: JSON.parse(err.message) },
      400
    );
  }

  // Hono HTTP exceptions
  if (err instanceof HTTPException) {
    return c.json(
      { error: err.message },
      err.status
    );
  }

  // Unexpected errors
  console.error("[Server Error]", err);
  return c.json(
    { error: "服务器内部错误" },
    500
  );
}
