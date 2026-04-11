import type { HttpAdapter } from "../types/http";

export interface AdapterStartEvent {
  readonly url: string;
  readonly init: RequestInit;
  readonly startedAt: number;
}

export interface AdapterSuccessEvent extends AdapterStartEvent {
  readonly response: Response;
  readonly durationMs: number;
}

export interface AdapterErrorEvent extends AdapterStartEvent {
  readonly error: unknown;
  readonly durationMs: number;
}

export interface AdapterHooks {
  readonly onStart?: (event: AdapterStartEvent) => void;
  readonly onSuccess?: (event: AdapterSuccessEvent) => void;
  readonly onError?: (event: AdapterErrorEvent) => void;
}

export function createInstrumentedAdapter(
  baseAdapter: HttpAdapter,
  hooks: AdapterHooks = {}
): HttpAdapter {
  return async (url, init) => {
    const startedAt = Date.now();
    const startEvent: AdapterStartEvent = { url, init, startedAt };
    hooks.onStart?.(startEvent);

    try {
      const response = await baseAdapter(url, init);
      hooks.onSuccess?.({
        ...startEvent,
        response,
        durationMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      hooks.onError?.({
        ...startEvent,
        error,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  };
}
