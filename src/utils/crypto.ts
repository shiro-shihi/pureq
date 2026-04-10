/**
 * Generates a cryptographically strong random ID.
 * Prefers crypto.randomUUID, falls back to crypto.getRandomValues,
 * and only uses Math.random as a last resort for environments
 * without any Web Crypto API support.
 */
export function generateSecureId(prefix?: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
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
