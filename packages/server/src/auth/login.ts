import crypto from "node:crypto";

export interface LoginResult {
  success: boolean;
  reason?: string;
  hashedPassword?: string;
}

/**
 * Validate user login credentials.
 *
 * Rules:
 * - Username must be at least 3 characters (trimmed)
 * - Password must be at least 8 characters
 * - Password must contain uppercase, lowercase, and digit
 * - Valid password is SHA256-hashed before return
 */
export function validateCredentials(username: string, password: string): LoginResult {
  const trimmed = username.trim();

  if (trimmed.length < 3) {
    return { success: false, reason: "用户名至少需要3个字符" };
  }

  if (password.length < 8) {
    return { success: false, reason: "密码长度至少需要8位" };
  }

  if (!/[A-Z]/.test(password)) {
    return { success: false, reason: "密码必须包含大写字母" };
  }

  if (!/[a-z]/.test(password)) {
    return { success: false, reason: "密码必须包含小写字母" };
  }

  if (!/[0-9]/.test(password)) {
    return { success: false, reason: "密码必须包含数字" };
  }

  return {
    success: true,
    hashedPassword: hashPassword(password),
  };
}

/**
 * Hash a password with SHA256 and return hex digest.
 */
export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password, "utf8").digest("hex");
}
