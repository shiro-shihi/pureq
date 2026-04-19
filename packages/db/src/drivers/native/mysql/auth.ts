/**
 * caching_sha2_password Implementation using standard Web Crypto API.
 * Zero dependencies. Compatible with Node.js, Cloudflare Workers, Deno, and Bun.
 */

const encoder = new TextEncoder();

export async function hashCachingSha2Password(password: string, salt: Uint8Array): Promise<Uint8Array> {
  if (!password) return new Uint8Array(0);
  
  const passBytes = encoder.encode(password);
  
  // Hash 1: SHA256(password)
  const hash1Buf = await crypto.subtle.digest("SHA-256", passBytes);
  const hash1 = new Uint8Array(hash1Buf);
  
  // Hash 2: SHA256(Hash 1)
  const hash2Buf = await crypto.subtle.digest("SHA-256", hash1);
  const hash2 = new Uint8Array(hash2Buf);
  
  // Hash 3: SHA256(hash2 || salt)
  const concat = new Uint8Array(hash2.length + salt.length);
  concat.set(hash2, 0);
  concat.set(salt, hash2.length);
  const hash3Buf = await crypto.subtle.digest("SHA-256", concat);
  const hash3 = new Uint8Array(hash3Buf);
  
  // XOR: Hash 1 ^ Hash 3
  const result = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    result[i] = hash1[i]! ^ hash3[i]!;
  }
  
  return result;
}

export async function encryptPasswordRsa(password: string, salt: Uint8Array, publicKeyPem: string): Promise<Uint8Array> {
  // Strip PEM headers
  const base64Key = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\n/g, "")
    .replace(/\r/g, "");
    
  const binaryKey = atob(base64Key);
  const keyBytes = new Uint8Array(binaryKey.length);
  for (let i = 0; i < binaryKey.length; i++) {
    keyBytes[i] = binaryKey.charCodeAt(i);
  }

  const key = await crypto.subtle.importKey(
    "spki",
    keyBytes.buffer as ArrayBuffer,
    { name: "RSA-OAEP", hash: "SHA-1" },
    false,
    ["encrypt"]
  );

  const passBytes = encoder.encode(password + "\0");
  const xored = new Uint8Array(passBytes.length);
  for (let i = 0; i < passBytes.length; i++) {
    xored[i] = passBytes[i]! ^ salt[i % salt.length]!;
  }

  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    key,
    xored.buffer as ArrayBuffer
  );

  return new Uint8Array(encrypted);
}
