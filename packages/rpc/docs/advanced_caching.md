# Advanced Caching: Result Pinning for 0ms Latency

`@pureq/rpc` includes a built-in **Result Pinning** engine. It allows you to serve pre-authorized binary responses directly from an Edge KV or memory cache, bypassing both the application logic and the database.

## How it Works

Pureq generates a **Deterministic Cache Key** based on:
1. **The QueryId:** Ensures the static structure is the same.
2. **The Parameters:** Ensures the specific data request matches.
3. **The SessionSecret:** Ensures User A can never access User B's cached data.

### The Lifecycle
1. **Request Received:** The handler verifies the HMAC signature.
2. **Cache Check:** If the signature is valid, it generates the cache key and checks the `CacheProvider`.
3. **Cache Hit:** The server returns the **raw binary** from the cache. No parsing, no logic execution.
4. **Cache Miss:** The procedure executes, and the resulting binary is stored in the cache for future requests.

## Implementation Example

You can implement a `CacheProvider` for any storage (Cloudflare KV, Redis, In-memory).

```typescript
// Define your cache provider
const myCache: CacheProvider = {
  get: async (key) => await env.MY_KV.get(key, "arrayBuffer"),
  set: async (key, value, ttl) => {
    await env.MY_KV.put(key, value, { expirationTtl: ttl });
  }
};

// Pass it to the RpcHandler
const handler = new RpcHandler({
  router,
  cache: myCache,
  defaultTtl: 3600 // 1 hour
});
```

## Security Guarantees
- **Identity-Locked:** Because the `sessionSecret` is part of the hash, cached data is physically isolated per user.
- **Integrity-First:** We only check the cache **after** a successful HMAC signature verification. It is impossible to probe the cache with unauthorized requests.
- **Zero-Parse:** Serving a cache hit is a direct byte-stream transfer, consuming near-zero CPU.
