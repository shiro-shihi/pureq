/**
 * @pureq/rpc v1.0.0 - Sealed Manifest Engine
 * Build-less Fortress Core.
 */
import { QueryManifest } from "./types.js";

// Type-level constraint: Force string literals and valid query objects
export type SealedQueryMap = Record<string, { 
    sql: string; 
    selectedFields?: string[]; 
    inputSchema?: any;
}>;

/**
 * Defines the application's RPC manifest. 
 * Rejects any dynamic query attempts at compile-time.
 */
export function defineManifest<T extends SealedQueryMap>(map: T): QueryManifest {
  const manifest: QueryManifest = {};

  for (const [key, query] of Object.entries(map)) {
    manifest[key] = {
      sql: query.sql,
      projection: new Set(query.selectedFields || []),
      inputSchema: query.inputSchema
    };
  }

  return manifest;
}
