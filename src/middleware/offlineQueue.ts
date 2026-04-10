import type { Middleware, RequestConfig } from "../types/http";
import type { HttpResponse } from "../response/response";
import { markPolicyMiddleware } from "../policy/guardrails";
import { HttpResponse as PureqHttpResponse } from "../response/response";
import { appendPolicyTrace } from "../utils/policyTrace";

export interface OfflineQueueHooks {
  readonly onQueued?: (event: {
    readonly id: number;
    readonly method: RequestConfig["method"];
    readonly url: string;
    readonly at: number;
  }) => void;
  readonly onReplayed?: (event: {
    readonly id: number;
    readonly method: RequestConfig["method"];
    readonly url: string;
    readonly at: number;
    readonly status: number;
  }) => void;
  readonly onReplayError?: (event: {
    readonly id: number;
    readonly method: RequestConfig["method"];
    readonly url: string;
    readonly at: number;
    readonly error: unknown;
  }) => void;
}

export interface OfflineQueueOptions {
  readonly methods?: readonly RequestConfig["method"][];
  readonly isOffline?: () => boolean;
  readonly maxQueueSize?: number;
  readonly ttlMs?: number;
  readonly hooks?: OfflineQueueHooks;
  readonly storage?: OfflineQueueStorageAdapter;
  readonly generateId?: () => number | Promise<number>;
  /**
   * Optional lock name for cross-tab coordination (Web Locks API).
   * If provided, only one tab will be able to flush the queue at a time.
   */
  readonly lockName?: string;
}

export interface QueuedRequest {
  readonly id: number;
  readonly req: RequestConfig;
  readonly queuedAt: number;
  readonly expiresAt?: number;
}

export interface OfflineQueueStorageAdapter {
  readonly push: (item: QueuedRequest) => Promise<void> | void;
  readonly getAll: () => Promise<readonly QueuedRequest[]> | readonly QueuedRequest[];
  readonly remove: (id: number) => Promise<void> | void;
  readonly clear: () => Promise<void> | void;
  readonly size: () => Promise<number> | number;
}

export class InMemoryQueueStorageAdapter implements OfflineQueueStorageAdapter {
  private queue: QueuedRequest[] = [];

  push(item: QueuedRequest): void {
    this.queue.push(item);
  }

  getAll(): readonly QueuedRequest[] {
    return [...this.queue];
  }

  remove(id: number): void {
    this.queue = this.queue.filter((item) => item.id !== id);
  }

  clear(): void {
    this.queue.length = 0;
  }

  size(): number {
    return this.queue.length;
  }
}

export interface OfflineQueueSnapshot {
  readonly size: number;
  readonly items: readonly {
    readonly id: number;
    readonly method: RequestConfig["method"];
    readonly url: string;
    readonly queuedAt: number;
    readonly expiresAt?: number;
    readonly priority: number;
  }[];
}

export interface OfflineQueueController {
  readonly middleware: Middleware;
  readonly flush: (
    replay: (req: RequestConfig) => Promise<HttpResponse>,
    options?: { readonly concurrency?: number }
  ) => Promise<readonly HttpResponse[]>;
  readonly snapshot: () => Promise<OfflineQueueSnapshot>;
  readonly clear: () => Promise<void>;
}

/**
 * Creates a serializable copy of the request suitable for offline storage.
 */
function cloneRequestForQueue(req: RequestConfig): RequestConfig {
  return {
    method: req.method,
    url: req.url,
    ...(req.params !== undefined ? { params: { ...req.params } } : {}),
    ...(req.query !== undefined ? { query: req.query } : {}),
    ...(req.body !== undefined ? { body: req.body } : {}),
    ...(req.headers !== undefined ? { headers: { ...req.headers } } : {}),
    ...(req.timeout !== undefined ? { timeout: req.timeout } : {}),
    ...(req.priority !== undefined ? { priority: req.priority } : {}),
    ...(req.meta !== undefined ? { meta: { ...req.meta } } : {}),
  };
}

/**
 * Creates an offline queue controller for safe mutation replay in browser-like contexts.
 */
export function createOfflineQueue(options: OfflineQueueOptions = {}): OfflineQueueController {
  const methods = new Set(options.methods ?? ["POST", "PUT", "PATCH", "DELETE"]);
  const maxQueueSize = options.maxQueueSize ?? 500;
  const ttlMs = options.ttlMs;
  const lockName = options.lockName;

  const isOffline = options.isOffline ?? (() => {
    if (typeof navigator === "undefined") {
      return false;
    }
    return navigator.onLine === false;
  });

  const storage = options.storage ?? new InMemoryQueueStorageAdapter();
  const hooks = options.hooks;
  let nextIdCounter = 1;
  const generateId = options.generateId ?? (() => nextIdCounter++);

  const middleware: Middleware = async (req, next) => {
    if (!methods.has(req.method) || !isOffline()) {
      return next(req);
    }

    const currentSize = await storage.size();
    if (currentSize >= maxQueueSize) {
      const error = new Error("pureq: offline queue is full");
      (error as any).code = "PUREQ_OFFLINE_QUEUE_FULL";
      (error as any).kind = "storage-error";
      throw error;
    }

    const id = await generateId();
    const queuedAt = Date.now();
    const expiresAt = ttlMs !== undefined ? queuedAt + ttlMs : undefined;
    
    const item: QueuedRequest = {
      id,
      req: cloneRequestForQueue(req),
      queuedAt,
    };
    if (expiresAt !== undefined) {
      (item as any).expiresAt = expiresAt;
    }
    
    await storage.push(item);

    appendPolicyTrace(req, {
      policy: "offline-queue",
      decision: "queued",
      at: queuedAt,
      reason: "offline mode",
      key: `${req.method}:${req.url}`,
    });

    hooks?.onQueued?.({ id, method: req.method, url: req.url, at: queuedAt });

    return new PureqHttpResponse(
      new Response(
        JSON.stringify({ queued: true, queueId: id, expiresAt }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        }
      )
    );
  };

  const performFlush = async (
    replay: (req: RequestConfig) => Promise<HttpResponse>,
    flushOptions?: { readonly concurrency?: number }
  ): Promise<readonly HttpResponse[]> => {
    const rawPending = await storage.getAll();
    const now = Date.now();

    // 1. Filter out expired requests
    const expiredIds: number[] = [];
    const pendingWithTtl = rawPending.filter((item) => {
      if (item.expiresAt !== undefined && item.expiresAt < now) {
        expiredIds.push(item.id);
        return false;
      }
      return true;
    });

    await Promise.all(expiredIds.map((id) => storage.remove(id)));

    // 2. Sort by priority (descending) and then by queuedAt (ascending)
    const pending = [...pendingWithTtl].sort((a, b) => {
      const priorityA = a.req.priority ?? 0;
      const priorityB = b.req.priority ?? 0;
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      return a.queuedAt - b.queuedAt;
    });

    const concurrency = flushOptions?.concurrency ?? 1;
    const responses: HttpResponse[] = [];

    if (concurrency <= 1) {
      for (const item of pending) {
        try {
          const response = await replay(item.req);
          responses.push(response);
          await storage.remove(item.id);

          hooks?.onReplayed?.({
            id: item.id,
            method: item.req.method,
            url: item.req.url,
            at: Date.now(),
            status: response.status,
          });
        } catch (error) {
          hooks?.onReplayError?.({
            id: item.id,
            method: item.req.method,
            url: item.req.url,
            at: Date.now(),
            error,
          });
        }
      }
    } else {
      // Concurrent replay in batches
      for (let i = 0; i < pending.length; i += concurrency) {
        const batch = pending.slice(i, i + concurrency);
        const results = await Promise.allSettled(
          batch.map(async (item) => {
            const response = await replay(item.req);
            await storage.remove(item.id);
            hooks?.onReplayed?.({
              id: item.id,
              method: item.req.method,
              url: item.req.url,
              at: Date.now(),
              status: response.status,
            });
            return response;
          })
        );

        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          if (result && result.status === "fulfilled") {
            responses.push(result.value);
          } else if (result && result.status === "rejected") {
            const item = batch[j];
            if (item) {
              hooks?.onReplayError?.({
                id: item.id,
                method: item.req.method,
                url: item.req.url,
                at: Date.now(),
                error: result.reason,
              });
            }
          }
        }
      }
    }

    return responses;
  };

  const flush = async (
    replay: (req: RequestConfig) => Promise<HttpResponse>,
    flushOptions?: { readonly concurrency?: number }
  ): Promise<readonly HttpResponse[]> => {
    // If Web Locks API is available and lockName is provided, wrap in a lock
    if (lockName && typeof navigator !== "undefined" && navigator.locks) {
      return navigator.locks.request(lockName, async () => {
        return performFlush(replay, flushOptions);
      }) as unknown as Promise<readonly HttpResponse[]>;
    }

    return performFlush(replay, flushOptions);
  };

  const snapshot = async (): Promise<OfflineQueueSnapshot> => {
    const items = await storage.getAll();
    return {
      size: items.length,
      items: items.map((item) => {
        const result = {
          id: item.id,
          method: item.req.method,
          url: item.req.url,
          queuedAt: item.queuedAt,
          priority: item.req.priority ?? 0,
        } as any;
        if (item.expiresAt !== undefined) {
          result.expiresAt = item.expiresAt;
        }
        return result;
      }),
    };
  };

  const clear = async (): Promise<void> => {
    await storage.clear();
  };

  return {
    middleware: markPolicyMiddleware(middleware, {
      name: "offlineQueue",
      kind: "cache",
    }),
    flush,
    snapshot,
    clear,
  };
}



/**
 * Middleware shortcut when queue controls are not needed directly.
 */
export function offlineQueue(options: OfflineQueueOptions = {}): Middleware {
  return createOfflineQueue(options).middleware;
}
