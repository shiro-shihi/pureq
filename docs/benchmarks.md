# Benchmark Methodology and Baseline

This document defines how to run pureq benchmarks and tracks baseline throughput/latency.

## 1. Command

```bash
npm run benchmark
```

This command runs [scripts/benchmark.ts](../scripts/benchmark.ts).

## 2. Benchmark Scenarios

- `baseline:getResult`
- `resilient-stack:getResult` (`dedupe + retry + circuitBreaker`)
- `baseline:getJson`

The benchmark uses an in-memory adapter (no real network) to isolate transport-layer overhead.

## 3. Baseline Report (2026-04-10)

Environment:

- Local development machine (Windows)
- Node.js runtime from current workspace toolchain

Latest output:

```text
pureq benchmark results
iterations per scenario: 5000

baseline:getResult           | ops/s=  58826 | p50=  0.012ms | p95=  0.030ms
resilient-stack:getResult    | ops/s=  22282 | p50=  0.034ms | p95=  0.071ms
baseline:getJson             | ops/s=  27826 | p50=  0.028ms | p95=  0.066ms
```

## 4. Notes

- Results are mainly useful for regression detection over time.
- Compare against previous reports rather than treating these as universal absolute numbers.
- For release evaluation, run benchmarks in CI or a fixed benchmark environment.
