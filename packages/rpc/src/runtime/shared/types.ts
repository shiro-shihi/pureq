/**
 * @pureq/rpc v1.0.0 - Protocol Definitions
 * Universal & Zero-Dependency.
 */

export const PUREQ_RPC_MAGIC = new Uint8Array([0x50, 0x52, 0x51, 0x01]);

export const TYPE_IDS = {
  NULL: 0,
  BOOL: 1,
  INT: 2,
  FLOAT: 3,
  STRING: 4,
  DATE: 5,
  OBJECT: 6,
  ARRAY: 7,
  BUFFER: 8,
  ERROR: 9 // Use 9 instead of 99 to prevent confusion with length bytes
} as const;

export interface ManifestEntry {
  sql: string;
  projection: Set<string>; 
  inputSchema?: any;
}

export interface QueryManifest {
  [queryId: string]: ManifestEntry;
}

export interface RPCContext {
  sessionSecret: string;
  userId?: string;
  [key: string]: any;
}

export interface RpcRequestPayload {
  queryId: string;
  signature: string;
  params: any;
}
