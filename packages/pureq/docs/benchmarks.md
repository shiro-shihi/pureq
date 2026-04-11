# Benchmark Methodology and Baselines

This document defines the benchmarking procedures for **pureq** and tracks baseline performance metrics to ensure zero regressions in transport-layer overhead.

## 1. Running Benchmarks

To execute the standard benchmark suite, run the following command from the project root:

```bash
npm run benchmark
```

This command executes the [scripts/benchmark.ts](../scripts/benchmark.ts) script using the project's current toolchain.

## 2. Benchmark Scenarios

The suite currently measures three primary scenarios to evaluate different layers of the library:

- **baseline:getResult**: Measures the raw overhead of the client and base execution logic.
- **resilient-stack:getResult**: Measures a realistic production stack including `dedupe()`, `retry()`, and `circuitBreaker()`.
- **baseline:getJson**: Measures text-to-JSON parsing overhead combined with the base request logic.

All benchmarks use an in-process memory adapter (no network calls) to exclusively measure the library's internal computational cost.

## 3. Baseline Report (2026-04-10)

### Environment

- Runtime: Node.js (Latest stable)
- OS: Windows 11
- Methodology: 5,000 warm-up iterations followed by 5,000 measured iterations.

### Latest Results

| Scenario | Operations/sec | p50 Latency | p95 Latency |
| --- | --- | --- | --- |
| baseline:getResult | 58,826 | 0.012 ms | 0.030 ms |
| resilient-stack:getResult | 22,282 | 0.034 ms | 0.071 ms |
| baseline:getJson | 27,826 | 0.028 ms | 0.066 ms |

## 4. Operational Notes

- **Regression Detection**: These metrics are primarily used for regression detection. Any architectural change that significantly lowers `ops/s` or increases `p95` latency must be justified.
- **Relative Comparison**: Performance numbers are hardware-dependent. Always compare against a previous local run on the same machine rather than treating these as universal constants.
- **CI Validation**: For release-grade evaluation, benchmarks should be run in a dedicated CI environment with stable CPU availability.
