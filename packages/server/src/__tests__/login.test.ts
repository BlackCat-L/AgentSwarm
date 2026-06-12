import { describe, it, expect } from "vitest";
import { validateCredentials, hashPassword } from "../auth/login.js";

describe("validateCredentials — username validation", () => {
  it("should reject empty username", () => {
    const result = validateCredentials("", "Abc12345");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("用户名至少需要3个字符");
  });

  it("should reject whitespace-only username", () => {
    const result = validateCredentials("   ", "Abc12345");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("用户名至少需要3个字符");
  });

  it("should reject username shorter than 3 characters", () => {
    const result = validateCredentials("ab", "Abc12345");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("用户名至少需要3个字符");
  });

  it("should accept username with exactly 3 characters", () => {
    const result = validateCredentials("abc", "Abc12345");
    expect(result.success).toBe(true);
  });
});

describe("validateCredentials — password validation", () => {
  it("should reject password shorter than 8 characters", () => {
    const result = validateCredentials("user", "Ab1c");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("密码长度至少需要8位");
  });

  it("should reject password missing uppercase", () => {
    const result = validateCredentials("user", "abc12345");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("密码必须包含大写字母");
  });

  it("should reject password missing lowercase", () => {
    const result = validateCredentials("user", "ABC12345");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("密码必须包含小写字母");
  });

  it("should reject password missing digit", () => {
    const result = validateCredentials("user", "Abcdefgh");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("密码必须包含数字");
  });

  it("should accept valid password and return SHA256 hash", () => {
    const result = validateCredentials("user", "Abc12345");
    expect(result.success).toBe(true);
    expect(result.hashedPassword).toBeDefined();
    expect(result.hashedPassword).toHaveLength(64); // SHA256 hex = 64 chars
    expect(result.hashedPassword).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should return deterministic hash for same password", () => {
    const a = validateCredentials("user", "Abc12345");
    const b = validateCredentials("user", "Abc12345");
    expect(a.hashedPassword).toBe(b.hashedPassword);
  });

  it("should return different hashes for different passwords", () => {
    const a = validateCredentials("user", "Abc12345");
    const b = validateCredentials("user", "Xyz67890");
    expect(a.hashedPassword).not.toBe(b.hashedPassword);
  });
});

describe("hashPassword", () => {
  it("should produce a 64-character hex string", () => {
    const hash = hashPassword("test");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should be deterministic", () => {
    expect(hashPassword("hello")).toBe(hashPassword("hello"));
  });

  it("should differ for different inputs", () => {
    expect(hashPassword("foo")).not.toBe(hashPassword("bar"));
  });
});
