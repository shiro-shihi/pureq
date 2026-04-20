/**
 * Pureq Universal Security Utilities
 * Zero-dependency. 100% Secure.
 */

/**
 * Generates a cryptographically secure random ID.
 * FAILS SAFE: Throws an error if a CSPRNG is not available.
 */
export function generateSecureId(prefixOrBytes: string | number = 32): string {
  if (typeof prefixOrBytes === "string") {
    if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID) {
      return `${prefixOrBytes}-${globalThis.crypto.randomUUID()}`;
    }
    // Fallback to random values if randomUUID is missing
    const array = new Uint8Array(16);
    if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.getRandomValues) {
       throw new Error("[Pureq Security Exception] CSPRNG is not available.");
    }
    globalThis.crypto.getRandomValues(array);
    const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${prefixOrBytes}-${hex}`;
  }

  const numBytes = (typeof prefixOrBytes === "number" && !isNaN(prefixOrBytes) && prefixOrBytes > 0) ? prefixOrBytes : 32;

  if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.getRandomValues) {
    throw new Error("[Pureq Security Exception] CSPRNG is not available.");
  }

  const array = new Uint8Array(numBytes);
  globalThis.crypto.getRandomValues(array);
  
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hardened Timing-Safe Comparison.
 * Optimized for performance while maintaining constant-time properties for equal lengths.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const lenA = a.length;
  const lenB = b.length;
  
  let diff = lenA ^ lenB;
  const maxLen = Math.max(lenA, lenB);
  
  for (let i = 0; i < maxLen; i++) {
    const charA = i < lenA ? a.charCodeAt(i) : 0;
    const charB = i < lenB ? b.charCodeAt(i) : 0;
    diff |= charA ^ charB;
  }
  
  return diff === 0;
}

/**
 * Encrypts a string using AES-GCM.
 * Format: IV:Ciphertext (Base64)
 */
export async function encrypt(data: string, key: CryptoKey): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  
  return `${ivHex}:${encryptedBase64}`;
}

/**
 * Decrypts a string using AES-GCM.
 * Expects: IV:Ciphertext (Base64)
 */
export async function decrypt(encryptedData: string, key: CryptoKey): Promise<string> {
  const parts = encryptedData.split(":");
  if (parts.length !== 2) {
    throw new Error("pureq: invalid encrypted data format");
  }
  
  const [ivHex, ciphertextBase64] = parts;
  const iv = new Uint8Array(ivHex!.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const ciphertext = new Uint8Array(atob(ciphertextBase64!).split("").map(c => c.charCodeAt(0)));
  
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}
