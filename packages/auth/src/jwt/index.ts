/**
 * Pureq JWT Core
 * Hardened against Algorithm Confusion and missing Claim Validation.
 */

import { base64Decode } from "../shared/index.js";

export interface JwtVerifyOptions {
  secret: string | CryptoKey;
  algorithms: string[]; // Required whitelist
  issuer?: string;
  audience?: string;
  clockTolerance?: number; // seconds
}

export async function decodeJwt<T = any>(token: string): Promise<T> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  try {
    return JSON.parse(base64Decode(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    throw new Error("Failed to decode JWT payload");
  }
}

export async function verifyJwt(token: string, options: JwtVerifyOptions): Promise<any> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64) throw new Error("Invalid JWT format");

  let header: any;
  try {
    header = JSON.parse(base64Decode(headerB64.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    throw new Error("Invalid JWT header");
  }

  // 1. Algorithm Whitelisting & Confusion Protection
  if (!header.alg || header.alg === "none") {
    throw new Error("Security Violation: JWT algorithm \"none\" is not permitted");
  }

  if (!options.algorithms.includes(header.alg)) {
    throw new Error(`Security Violation: Unsupported JWT algorithm ${header.alg}`);
  }

  // Map JWT alg to WebCrypto alg
  let verifyParams: any;
  let keyType: "raw" | "spki" | "pkcs8" = "raw";

  if (header.alg.startsWith("HS")) {
    const hash = `SHA-${header.alg.slice(2)}`;
    verifyParams = { name: "HMAC", hash };
    keyType = "raw";
  } else if (header.alg.startsWith("RS")) {
    const hash = `SHA-${header.alg.slice(2)}`;
    verifyParams = { name: "RSASSA-PKCS1-v1_5", hash };
    keyType = "spki";
  } else if (header.alg.startsWith("ES")) {
    // Simplified ES mapping
    const hash = `SHA-${header.alg.slice(2)}`;
    const namedCurve = header.alg === "ES256" ? "P-256" : header.alg === "ES384" ? "P-384" : "P-521";
    verifyParams = { name: "ECDSA", namedCurve, hash };
    keyType = "spki";
  } else {
    throw new Error(`Security Violation: Unsupported algorithm ${header.alg}`);
  }

  const payload = JSON.parse(base64Decode(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
  const signature = new Uint8Array(base64Decode(signatureB64.replace(/-/g, "+").replace(/_/g, "/")).split("").map(c => c.charCodeAt(0)));

  let cryptoKey: CryptoKey;
  if (typeof options.secret === "string") {
    const keyData = new TextEncoder().encode(options.secret);
    // CRITICAL: We MUST NOT use header.alg to determine how to import the key 
    // if it could lead to interpreting a public key as an HMAC secret.
    // However, if the user provides a string secret, we assume it's for HMAC.
    // For asymmetric, they should ideally pass a CryptoKey or we need to handle PEM.
    if (header.alg.startsWith("HS")) {
      cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: (verifyParams as any).hash },
        false,
        ["verify"]
      );
    } else {
      throw new Error(`Security Violation: Asymmetric algorithm ${header.alg} requires a CryptoKey or SPKI/PKCS8 formatted secret`);
    }
  } else {
    cryptoKey = options.secret;
  }

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const isValid = await crypto.subtle.verify(verifyParams as any, cryptoKey, signature, data);
  if (!isValid) throw new Error("Security Violation: Invalid signature");

  // 2. Claim Validation (exp, nbf, iss, aud)
  const now = Math.floor(Date.now() / 1000);
  const tolerance = options.clockTolerance || 0;

  if (payload.exp && (now - tolerance) >= payload.exp) {
    throw new Error("Security Violation: Token expired");
  }
  if (payload.nbf && (now + tolerance) < payload.nbf) {
    throw new Error("Security Violation: Token not yet valid");
  }
  if (options.issuer && payload.iss !== options.issuer) {
    throw new Error("Security Violation: Issuer mismatch");
  }
  if (options.audience) {
      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!audiences.includes(options.audience)) {
          throw new Error("Security Violation: Audience mismatch");
      }
  }

  return payload;
}
