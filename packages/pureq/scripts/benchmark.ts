import { performance } from "node:perf_hooks";
import { circuitBreaker, createClient, dedupe, retry } from "../src/index";

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx] ?? 0;
}

async function runScenario(
  name: string,
  iterations: number,
  fn: (iteration: number) => Promise<void>
): Promise<{
  name: string;
  iterations: number;
  totalMs: number;
  opsPerSec: number;
  p50: number;
  p95: number;
}> {
  const samples: number[] = [];
  const started = performance.now();

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn(i);
    samples.push(performance.now() - t0);
  }

  const totalMs = performance.now() - started;
  const opsPerSec = (iterations / totalMs) * 1000;

  return {
    name,
    iterations,
    totalMs,
    opsPerSec,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
  };
}

async function main(): Promise<void> {
  const baseAdapter = async () => {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const baselineClient = createClient({ adapter: baseAdapter });

  const resilientClient = createClient({ adapter: baseAdapter })
    .use(dedupe())
    .use(retry({ maxRetries: 1, delay: 0, backoff: false }))
    .use(circuitBreaker({ failureThreshold: 5, cooldownMs: 1000 }));

  const iterations = 5000;

  await runScenario("warmup", 300, async () => {
    await baselineClient.getResult("https://bench.local/ping");
  });

  const results = [];

  results.push(
    await runScenario("baseline:getResult", iterations, async () => {
      await baselineClient.getResult("https://bench.local/ping");
    })
  );

  results.push(
    await runScenario("resilient-stack:getResult", iterations, async () => {
      await resilientClient.getResult("https://bench.local/ping");
    })
  );

  results.push(
    await runScenario("baseline:getJson", iterations, async () => {
      await baselineClient.getJson("https://bench.local/ping");
    })
  );

  console.log("pureq benchmark results");
  console.log("iterations per scenario:", iterations);
  console.log("");

  for (const row of results) {
    console.log(
      `${row.name.padEnd(28)} | ops/s=${row.opsPerSec.toFixed(0).padStart(7)} | p50=${row.p50
        .toFixed(3)
        .padStart(7)}ms | p95=${row.p95.toFixed(3).padStart(7)}ms`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
