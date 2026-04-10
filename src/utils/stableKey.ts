/**
 * Shared stable key generation utilities for deduplication and caching.
 * Produces deterministic string keys from request properties so that
 * identical requests always map to the same cache/dedupe slot.
 */

import type { QueryParams } from "../types/http";

/**
 * Returns a deterministic string from a record of key-value pairs,
 * sorted alphabetically by key.
 */
export function stableKeyValues(record: Readonly<Record<string, string>> | undefined): string {
  if (!record) {
    return "";
  }

  return Object.entries(record)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

/**
 * Returns a deterministic string from a QueryParams map,
 * sorted alphabetically by key with arrays expanded inline.
 */
export function stableQuery(query: QueryParams | undefined): string {
  if (!query) {
    return "";
  }

  const keys = Object.keys(query).sort((a, b) => a.localeCompare(b));
  const parts: string[] = [];

  for (const key of keys) {
    const value = query[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
      }
      continue;
    }

    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }

  return parts.join("&");
}
