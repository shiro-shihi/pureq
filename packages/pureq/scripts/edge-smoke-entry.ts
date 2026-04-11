import { circuitBreaker, createClient, dedupe, retry } from "../src/index";

declare global {
  // eslint-disable-next-line no-var
  var __PUREQ_EDGE_SMOKE__: () => Promise<{ ok: boolean; status: number }>;
}

globalThis.__PUREQ_EDGE_SMOKE__ = async () => {
  const client = createClient({
    adapter: async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  })
    .use(dedupe())
    .use(retry({ maxRetries: 1, delay: 0, backoff: false }))
    .use(circuitBreaker({ failureThreshold: 3, cooldownMs: 1000 }));

  const result = await client.getResult("https://edge.example.com/health");
  if (!result.ok) {
    return { ok: false, status: 0 };
  }

  return {
    ok: result.data.ok,
    status: result.data.status,
  };
};
