/**
 * @pureq/rpc v1.0.0 - Universal Security Core
 * Identity-Bound Integrity without Redundant Encryption.
 */

export async function generateRequestSignature(
  sessionSecret: string,
  queryId: string,
  paramsPayload: Uint8Array
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(sessionSecret);
  
  const queryIdBytes = encoder.encode(queryId);
  const msgData = new Uint8Array(queryIdBytes.length + paramsPayload.length);
  msgData.set(queryIdBytes, 0);
  msgData.set(paramsPayload, queryIdBytes.length);

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await globalThis.crypto.subtle.sign("HMAC", cryptoKey, msgData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generates a deterministic cache key for a specific query, its params, and the user session.
 */
export async function generateCacheKey(
  sessionSecret: string,
  queryId: string,
  paramsPayload: Uint8Array
): Promise<string> {
  const encoder = new TextEncoder();
  // We combine all identity markers to ensure User A never gets User B's cache.
  const data = new Uint8Array([
    ...encoder.encode(sessionSecret),
    ...encoder.encode(queryId),
    ...paramsPayload
  ]);
  
  const hash = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  const lenA = a.length;
  const lenB = b.length;
  
  let diff = lenA ^ lenB;
  
  // Use the longer length to ensure we don't truncate the comparison
  const maxLen = Math.max(lenA, lenB);
  
  for (let i = 0; i < maxLen; i++) {
    const charA = i < lenA ? a.charCodeAt(i) : 0;
    const charB = i < lenB ? b.charCodeAt(i) : 0;
    diff |= charA ^ charB;
  }
  
  return diff === 0;
}
