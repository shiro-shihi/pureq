import { generateSecureId } from "@pureq/pureq";
import { base64Encode, base64Decode } from "../shared/index.js";
import type { AuthEncryption, AuthEncryptionOptions } from "../shared/index.js";

/**
 * Pureq Universal Auth Encryption
 * AES-GCM 256-bit with PBKDF2 Key Derivation and Dynamic Salt.
 */

export async function encrypt(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const rawData = encoder.encode(data);
  
  // 1. Generate 16-byte random salt for PBKDF2
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);

  // 2. Derive Key using PBKDF2
  const key = await deriveKey(secret, salt);

  // 3. Encrypt using AES-GCM
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);

  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    rawData
  );

  // 4. Combine: IV (12) + Salt (16) + Payload
  const combined = new Uint8Array(12 + 16 + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(salt, 12);
  combined.set(new Uint8Array(encrypted), 28);

  // 5. Return as Base64 (Universal)
  return base64Encode(String.fromCharCode(...combined));
}

export async function decrypt(encryptedBase64: string, secret: string): Promise<string> {
  const combined = new Uint8Array(base64Decode(encryptedBase64).split("").map(c => c.charCodeAt(0)));
  
  const iv = new Uint8Array(combined.slice(0, 12));
  const salt = new Uint8Array(combined.slice(12, 28));
  const data = new Uint8Array(combined.slice(28));

  const key = await deriveKey(secret, salt);

  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  return new TextDecoder().decode(decrypted);
}

export function createAuthEncryption(secret: string, options: AuthEncryptionOptions = {}): AuthEncryption {
  return {
    async encrypt(data: any) {
      return encrypt(JSON.stringify(data), secret);
    },
    async decrypt(encrypted: string) {
      return JSON.parse(await decrypt(encrypted, secret));
    }
  };
}

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
