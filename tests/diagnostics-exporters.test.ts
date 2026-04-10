import { describe, expect, it, vi } from "vitest";
import {
  createConsoleDiagnosticsExporter,
  createOpenTelemetryDiagnosticsExporter,
} from "../src/middleware/diagnosticsExporters";

describe("diagnostics exporters", () => {
  it("exports events to console logger", () => {
    const log = vi.fn();
    const exporter = createConsoleDiagnosticsExporter({ log });

    exporter.export({
      phase: "success",
      at: Date.now(),
      method: "GET",
      url: "https://example.com/health",
      startedAt: Date.now(),
      status: 200,
      durationMs: 12,
      retryCount: 0,
    });

    expect(log).toHaveBeenCalledTimes(1);
  });

  it("exports events to OpenTelemetry-like meter", () => {
    const add = vi.fn();
    const record = vi.fn();

    const meter = {
      createCounter: () => ({ add }),
      createHistogram: () => ({ record }),
    };

    const exporter = createOpenTelemetryDiagnosticsExporter(meter);

    exporter.export({
      phase: "success",
      at: Date.now(),
      method: "GET",
      url: "https://example.com/health",
      startedAt: Date.now(),
      status: 200,
      durationMs: 9,
      retryCount: 0,
    });

    expect(add).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
  });
});
