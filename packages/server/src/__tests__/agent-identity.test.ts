// ============================================================
// AgentIdentity tests — Ed25519 keys + fingerprint + identicon + JWT
// ============================================================

import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  deriveFingerprint,
  formatFingerprint,
  generateIdenticon,
  signAgentJWT,
  verifyAgentJWT,
  createAgentIdentity,
} from "../engine/agent-identity.js";

describe("AgentIdentity — key generation", () => {
  it("should generate Ed25519 key pair", async () => {
    const { publicKey, privateKey } = await generateKeyPair();

    expect(publicKey.kty).toBe("OKP");
    expect(publicKey.crv).toBe("Ed25519");
    expect(publicKey.x).toBeDefined();
    expect(privateKey.d).toBeDefined();
    // Public key should be 32 bytes → 43 chars in base64url
    expect((publicKey.x as string).length).toBeGreaterThanOrEqual(40);
  });
});

describe("AgentIdentity — fingerprint", () => {
  it("should derive 16-char hex fingerprint from public key", async () => {
    const { publicKey } = await generateKeyPair();
    const fp = deriveFingerprint(publicKey);

    expect(fp.length).toBe(16);
    expect(/^[0-9a-f]+$/.test(fp)).toBe(true);
  });

  it("should be deterministic — same key → same fingerprint", async () => {
    const { publicKey } = await generateKeyPair();
    const fp1 = deriveFingerprint(publicKey);
    const fp2 = deriveFingerprint(publicKey);

    expect(fp1).toBe(fp2);
  });

  it("should produce different fingerprints for different keys", async () => {
    const k1 = await generateKeyPair();
    const k2 = await generateKeyPair();

    const fp1 = deriveFingerprint(k1.publicKey);
    const fp2 = deriveFingerprint(k2.publicKey);

    expect(fp1).not.toBe(fp2);
  });

  it("formatFingerprint should group into 4-char segments", () => {
    const formatted = formatFingerprint("a3f72b1c8e4d5f9a");
    expect(formatted).toBe("a3f7:2b1c:8e4d:5f9a");
  });
});

describe("AgentIdentity — identicon", () => {
  it("should generate valid SVG", () => {
    const svg = generateIdenticon("a3f72b1c8e4d5f9a");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="64"');
    expect(svg).toContain('height="64"');
  });

  it("should be deterministic — same fingerprint → same SVG", () => {
    const fp = "a3f72b1c8e4d5f9a";
    expect(generateIdenticon(fp)).toBe(generateIdenticon(fp));
  });

  it("should produce different SVGs for different fingerprints", () => {
    const svg1 = generateIdenticon("a3f72b1c8e4d5f9a");
    const svg2 = generateIdenticon("b4e83c9d5f6a7b0c");
    expect(svg1).not.toBe(svg2);
  });

  it("should support custom sizes", () => {
    const svg = generateIdenticon("a3f72b1c8e4d5f9a", 128);
    expect(svg).toContain('width="128"');
    expect(svg).toContain('height="128"');
  });
});

describe("AgentIdentity — JWT", () => {
  it("should sign and verify JWT round-trip", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const fp = deriveFingerprint(publicKey);

    const token = await signAgentJWT("agent-001", fp, privateKey);
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");

    const payload = await verifyAgentJWT(token, publicKey);
    expect(payload).not.toBeNull();
    expect(payload!.agentId).toBe("agent-001");
    expect(payload!.fingerprint).toBe(fp);
  });

  it("should reject JWT signed with wrong key", async () => {
    const k1 = await generateKeyPair();
    const k2 = await generateKeyPair();
    const fp = deriveFingerprint(k1.publicKey);

    const token = await signAgentJWT("agent-001", fp, k1.privateKey);
    const payload = await verifyAgentJWT(token, k2.publicKey);

    expect(payload).toBeNull();
  });

  it("should reject tampered JWT", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const fp = deriveFingerprint(publicKey);

    const token = await signAgentJWT("agent-001", fp, privateKey);
    const tampered = token.slice(0, -5) + "xxxxx";

    const payload = await verifyAgentJWT(tampered, publicKey);
    expect(payload).toBeNull();
  });

  it("should reject expired JWT", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const fp = deriveFingerprint(publicKey);

    // Sign with 0 minutes expiration (immediately expired)
    const token = await signAgentJWT("agent-001", fp, privateKey, "agent-swarm-server", 0);
    const payload = await verifyAgentJWT(token, publicKey);

    expect(payload).toBeNull();
  });
});

describe("AgentIdentity — full identity creation", () => {
  it("should create complete AgentIdentity with all fields", async () => {
    const identity = await createAgentIdentity("agent-full-001");

    expect(identity.agentId).toBe("agent-full-001");
    expect(identity.fingerprint).toMatch(/^[0-9a-f]{4}:[0-9a-f]{4}:[0-9a-f]{4}:[0-9a-f]{4}$/);
    expect(identity.publicKey).toBeDefined();
    expect(identity.privateJWK).toBeDefined();
    expect(identity.identiconSvg).toContain("<svg");
    expect(identity.created_at).toBeDefined();

    // Verify the public key JSON can be parsed
    const pubJWK = JSON.parse(identity.publicKey);
    expect(pubJWK.kty).toBe("OKP");
    expect(pubJWK.crv).toBe("Ed25519");
  });
});
