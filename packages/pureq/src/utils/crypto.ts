/**
 * Generates a cryptographically strong random ID.
 * Prefers crypto.randomUUID, falls back to crypto.getRandomValues,
 * and only uses Math.random as a last resort for environments
 * without any Web Crypto API support.
 */
export function generateSecureId(prefix?: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    const value = crypto.randomUUID();
    return prefix ? `${prefix}-${value}` : value;
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return prefix ? `${prefix}-${hex}` : hex;
  }

  // Last resort fallback for legacy environments without Web Crypto API.
  // This is NOT cryptographically secure.
  return `${prefix ?? "id"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

/**
 * Encrypts a string using AES-GCM with a provided CryptoKey.
 * Returns a base64 string containing [iv:base64]:[ciphertext:base64].
 */
export async function encrypt(text: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  const ivBase64 = uint8ArrayToBase64(iv);
  const cipherBase64 = uint8ArrayToBase64(new Uint8Array(ciphertext));

  return `${ivBase64}:${cipherBase64}`;
}

/**
 * Decrypts a base64 string (formatted as iv:ciphertext) using AES-GCM and a CryptoKey.
 */
export async function decrypt(encryptedData: string, key: CryptoKey): Promise<string> {
  const [ivBase64, cipherBase64] = encryptedData.split(":");
  if (!ivBase64 || !cipherBase64) {
    throw new Error("pureq: invalid encrypted data format");
  }

  let ivRaw: string;
  let cipherRaw: string;
  try {
    ivRaw = atob(ivBase64);
    cipherRaw = atob(cipherBase64);
  } catch {
    throw new Error("pureq: invalid encrypted payload (base64 decode failed)");
  }

  const iv = Uint8Array.from(ivRaw, (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(cipherRaw, (c) => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
