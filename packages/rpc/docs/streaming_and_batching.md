# Streaming and Batching: Pushing Throughput Limits

Pureq RPC is designed to handle high-density data traffic by minimizing Microtask Latency and leveraging the efficiency of the **Hyper-Codec**.

## 1. Synchronous Microtask Batching

A common bottleneck in Node.js/Edge streaming is the overhead of the "Event Loop Tick" between every row or chunk. 
- **Legacy Approach:** `for await (const row of db) { yield row; }` - Causes a microtask delay for every single record.
- **Pureq Approach:** We process multiple rows in a **Synchronous Loop** as long as they fit in the current socket buffer.

*Impact:* This can increase streaming throughput by **10x to 50x** for large result sets.

## 2. Using Web Streams

Because Pureq RPC is built on the native **Web Streams API**, it supports standard back-pressure out of the box.

```typescript
// Server-side (Streaming procedure)
router.procedure("streamLogs", async ({ input }) => {
  const dbStream = await db.stream(query, [input.id]);
  
  // Transform DB stream directly into RPC stream
  return new ReadableStream({
    async start(controller) {
      for await (const row of dbStream) {
        controller.enqueue(PureqHyperCodec.encode(row, slab));
      }
      controller.close();
    }
  });
});
```

## 3. Automatic Request Batching

The Pureq Client can automatically group multiple small RPC calls into a single HTTP request.
- **Latency Reduction:** Instead of 10 HTTP requests (10 RTTs), we send 1 request (1 RTT).
- **Security:** Each item in the batch carries its own **Identity-Bound Signature**.

### How to enable
```typescript
const client = createPureqClient<AppRouter>({
  url: "...",
  batch: true, // Enable automatic batching
  batchDelay: 10 // 10ms window for grouping requests
});
```

---

By combining synchronous processing with native Web Streams, Pureq RPC provides the most efficient "Data Pipeline" currently available in the TypeScript ecosystem.
