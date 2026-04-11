import type { RequestConfig } from "./http";
import type { PureqErrorKind } from "./result";

export type TransportEventPhase = "start" | "success" | "error";

export interface PolicyTraceEntry {
  readonly policy: string;
  readonly decision: string;
  readonly at: number;
  readonly reason: string;
  readonly attempt?: number;
  readonly waitTimeMs?: number;
  readonly status?: number;
  readonly source?: string;
  readonly retryAfterMs?: number;
  readonly budgetRemainingMs?: number;
  readonly key?: string;
  readonly ageMs?: number;
  readonly ttlMs?: number;
}

export interface TransportEvent {
  readonly phase: TransportEventPhase;
  readonly at: number;
  readonly requestId?: string;
  readonly method: RequestConfig["method"];
  readonly url: string;
  readonly startedAt?: number;
  readonly durationMs?: number;
  readonly status?: number;
  readonly retryCount?: number;
  readonly errorKind?: PureqErrorKind;
  readonly policyTrace?: readonly PolicyTraceEntry[];
}

export type TransportStartEvent = TransportEvent & {
  readonly phase: "start";
  readonly startedAt: number;
};

export type TransportSuccessEvent = TransportEvent & {
  readonly phase: "success";
  readonly startedAt: number;
  readonly durationMs: number;
  readonly status: number;
  readonly retryCount: number;
};

export type TransportErrorEvent = TransportEvent & {
  readonly phase: "error";
  readonly startedAt: number;
  readonly durationMs: number;
  readonly errorKind: PureqErrorKind;
};
