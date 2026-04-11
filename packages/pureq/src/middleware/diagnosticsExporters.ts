import type { DiagnosticEvent } from "./diagnostics";

export interface DiagnosticsExporter {
  readonly export: (event: DiagnosticEvent) => void;
}

export interface OpenTelemetryLikeMeter {
  readonly createCounter: (
    name: string,
    options?: { description?: string }
  ) => { add: (value: number, attributes?: Record<string, string | number | boolean>) => void };
  readonly createHistogram: (
    name: string,
    options?: { description?: string; unit?: string }
  ) => { record: (value: number, attributes?: Record<string, string | number | boolean>) => void };
}

/**
 * Console-based diagnostics exporter for development/debugging.
 *
 * WARNING: This exporter logs full URLs which may contain sensitive query
 * parameters. Use `redactUrlQueryParams()` to sanitize event URLs before
 * passing them to production logging exporters.
 */
export function createConsoleDiagnosticsExporter(
  logger: Pick<Console, "log"> = console
): DiagnosticsExporter {
  return {
    export(event) {
      logger.log(
        `[pureq] phase=${event.phase} ${event.method} ${event.url} duration=${event.durationMs}ms status=${event.status ?? "n/a"} errorKind=${event.errorKind ?? "none"} policyTrace=${event.policyTrace?.length ?? 0}`
      );
    },
  };
}

export function createOpenTelemetryDiagnosticsExporter(
  meter: OpenTelemetryLikeMeter
): DiagnosticsExporter {
  const counter = meter.createCounter("pureq.requests.total", {
    description: "Total pureq requests observed by diagnostics",
  });
  const histogram = meter.createHistogram("pureq.request.duration", {
    description: "pureq request duration",
    unit: "ms",
  });

  return {
    export(event) {
      const attributes: Record<string, string | number | boolean> = {
        phase: event.phase,
        method: event.method,
        url: event.url,
        success: event.phase === "success",
      };

      if (event.status !== undefined) {
        attributes.status = event.status;
      }
      if (event.errorKind !== undefined) {
        attributes.errorKind = event.errorKind;
      }
      if (event.policyTrace !== undefined) {
        attributes.policyTraceCount = event.policyTrace.length;
      }

      counter.add(1, attributes);
      histogram.record(event.durationMs, attributes);
    },
  };
}
