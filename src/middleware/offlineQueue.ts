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
  readonly hooks?: OfflineQueueHooks;
  readonly storage?: OfflineQueueStorageAdapter;
  readonly generateId?: () => number | Promise<number>;
}

export interface QueuedRequest {
  readonly id: number;
  readonly req: RequestConfig;
  readonly queuedAt: number;
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

// appendPolicyTrace is imported from ../utils/policyTrace

/**
 * Creates a serializable copy of the request suitable for offline storage.
 * Deliberately excludes AbortSignal since it is not serializable and
 * would reference a stale controller upon replay.
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
  };
}

/**
 * Creates an offline queue controller for safe mutation replay in browser-like contexts.
 */
export function createOfflineQueue(options: OfflineQueueOptions = {}): OfflineQueueController {
  const methods = new Set(options.methods ?? ["POST", "PUT", "PATCH", "DELETE"]);
  const maxQueueSize = options.maxQueueSize ?? 500;
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
      throw new Error("pureq: offline queue is full");
    }

    const id = await generateId();
    const queuedAt = Date.now();
    
    await storage.push({
      id,
      req: cloneRequestForQueue(req),
      queuedAt,
    });

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
        JSON.stringify({ queued: true, queueId: id }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        }
      )
    );
  };

  const flush = async (
    replay: (req: RequestConfig) => Promise<HttpResponse>,
    options?: { readonly concurrency?: number }
  ): Promise<readonly HttpResponse[]> => {
    const pending = await storage.getAll();
    const concurrency = options?.concurrency ?? 1;

    const responses: HttpResponse[] = [];

    if (concurrency <= 1) {
      // Sequential replay (default, safest for ordering guarantees)
      for (const item of pending) {
        try {
          const response = await replay(item.req);
          responses.push(response);

          // Remove from queue only after successful replay.
          // NOTE: If the app crashes between successful replay and this removal,
          // the request might be replayed again upon restart. It is strongly recommended
          // to use `idempotencyKey` middleware to prevent duplicate operations on the backend.
          await storage.remove(item.id);

          hooks?.onReplayed?.({
            id: item.id,
            method: item.req.method,
            url: item.req.url,
            at: Date.now(),
            status: response.status,
          });
        } catch (error) {
          // Leave in storage on failure (defer to next flush or retry budgets)
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
      // Concurrent replay in batches of `concurrency`
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

  const snapshot = async (): Promise<OfflineQueueSnapshot> => {
    const items = await storage.getAll();
    return {
      size: items.length,
      items: items.map((item) => ({
        id: item.id,
        method: item.req.method,
        url: item.req.url,
        queuedAt: item.queuedAt,
      })),
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
