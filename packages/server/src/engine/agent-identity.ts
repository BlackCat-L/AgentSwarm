// ============================================================
// AgentIdentity — Ed25519 keypairs + JWT + fingerprint + identicon
// Reference: PRD §0.6 Agent身份体系, agent-kanban Ed25519 design
// ============================================================

import * as jose from "jose";
import { createHash } from "node:crypto";
import type { AgentIdentity } from "@agent-swarm/shared";

// ── Key Generation ─────────────────────────────────────────

/**
 * Generate an Ed25519 key pair using Web Crypto API.
 * Returns the key pair in JWK format (public + private).
 */
export async function generateKeyPair(): Promise<{
  publicKey: jose.JWK;
  privateKey: jose.JWK;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );

  // Narrow: Ed25519 generates CryptoKeyPair (not a single CryptoKey)
  if (!("publicKey" in keyPair)) {
    throw new Error("Expected CryptoKeyPair from Ed25519 key generation");
  }

  const [publicJWK, privateJWK] = await Promise.all([
    crypto.subtle.exportKey("jwk", keyPair.publicKey),
    crypto.subtle.exportKey("jwk", keyPair.privateKey),
  ]);

  return { publicKey: publicJWK, privateKey: privateJWK };
}

/**
 * Import an Ed25519 private key from JWK for signing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function importPrivateKey(jwk: jose.JWK): Promise<any> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "Ed25519" },
    false,
    ["sign"]
  );
}

// ── Fingerprint ────────────────────────────────────────────

/**
 * Derive a 16-char hex fingerprint from a JWK public key.
 * SHA-256 hash → take first 16 hex characters.
 */
export function deriveFingerprint(publicJWK: jose.JWK): string {
  const json = JSON.stringify({
    kty: publicJWK.kty,
    crv: publicJWK.crv,
    x: publicJWK.x,
  });
  const hash = createHash("sha256").update(json).digest("hex");
  return hash.slice(0, 16);
}

/**
 * Format fingerprint as readable groups: "a3f7:2b1c:8e4d:5f9a"
 */
export function formatFingerprint(fp: string): string {
  const parts: string[] = [];
  for (let i = 0; i < fp.length; i += 4) {
    parts.push(fp.slice(i, i + 4));
  }
  return parts.join(":");
}

// ── Identicon ──────────────────────────────────────────────

/**
 * Generate a deterministic 64×64 SVG identicon from a fingerprint string.
 * Produces a 5×5 symmetric grid with color derived from the hash.
 */
export function generateIdenticon(
  fingerprint: string,
  size = 64
): string {
  // Derive colour and pattern from fingerprint hash
  const hash = createHash("sha256").update(fingerprint).digest("hex");

  // Foreground colour from first 6 hex chars of hash
  const fgColor = `#${hash.slice(0, 6)}`;
  const bgColor = "#09090B"; // Dark Factory background

  // Build a 5×5 grid (25 cells), mirrored for symmetry
  const gridSize = 5;
  const cellCount = Math.ceil(gridSize * gridSize / 2) + 1; // left half + center column
  const cells: boolean[] = [];
  for (let i = 0; i < cellCount; i++) {
    const byte = parseInt(hash.slice((i * 2) % hash.length, (i * 2 + 2) % hash.length + 2), 16) || 0;
    cells.push(byte % 2 === 0);
  }

  const cellPx = size / gridSize;
  const padding = 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  svg += `<rect width="${size}" height="${size}" fill="${bgColor}" rx="4"/>`;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      // Mirror: compute the source column index
      const sourceCol = col >= Math.ceil(gridSize / 2)
        ? gridSize - 1 - col
        : col;
      const idx = row * Math.ceil(gridSize / 2) + sourceCol;
      const filled = cells[idx];

      if (filled) {
        const x = col * cellPx + padding / 2;
        const y = row * cellPx + padding / 2;
        const w = cellPx - padding;
        svg += `<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="${fgColor}" rx="2"/>`;
      }
    }
  }

  svg += "</svg>";
  return svg;
}

// ── JWT ────────────────────────────────────────────────────

/**
 * Sign a JWT with the agent's Ed25519 private key.
 * Used for authenticating Agent → Server API calls.
 */
export async function signAgentJWT(
  agentId: string,
  fingerprint: string,
  privateJWK: jose.JWK,
  audience = "agent-swarm-server",
  expirationMinutes = 60
): Promise<string> {
  const key = await importPrivateKey(privateJWK);

  const jwt = await new jose.SignJWT({
    agentId,
    fingerprint,
    type: "agent-session",
  })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${expirationMinutes}m`)
    .setIssuer("agent-swarm")
    .setAudience(audience)
    .setSubject(agentId)
    .sign(key);

  return jwt;
}

/**
 * Verify an Agent JWT and return the payload.
 * Returns null if the signature is invalid or token is expired.
 */
export async function verifyAgentJWT(
  jwt: string,
  publicJWK: jose.JWK,
  audience = "agent-swarm-server"
): Promise<{ agentId: string; fingerprint: string } | null> {
  try {
    const key = await jose.importJWK(publicJWK, "EdDSA");
    const { payload } = await jose.jwtVerify(jwt, key, {
      issuer: "agent-swarm",
      audience,
    });

    if (
      typeof payload.agentId !== "string" ||
      typeof payload.fingerprint !== "string"
    ) {
      return null;
    }

    return {
      agentId: payload.agentId,
      fingerprint: payload.fingerprint,
    };
  } catch {
    return null;
  }
}

// ── Full Identity Creation ─────────────────────────────────

/**
 * Create a full AgentIdentity — generates keys, derives fingerprint, creates identicon.
 * This is called once during agent registration.
 */
export async function createAgentIdentity(
  agentId: string
): Promise<AgentIdentity & { privateJWK: jose.JWK; identiconSvg: string }> {
  const { publicKey, privateKey } = await generateKeyPair();
  const fingerprint = deriveFingerprint(publicKey);
  const identiconSvg = generateIdenticon(fingerprint);

  return {
    agentId,
    fingerprint: formatFingerprint(fingerprint),
    publicKey: JSON.stringify(publicKey),
    created_at: new Date().toISOString(),
    privateJWK: privateKey,
    identiconSvg,
  };
}
