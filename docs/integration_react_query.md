# Integration Guide: React Query + pureq

This guide shows how to use pureq as the transport policy layer and React Query as the UI server-state layer.

## Why combine them

- pureq: typed routes, retry/circuit policies, observability, error contract
- React Query: cache lifecycle, background revalidation, mutation orchestration

## Recommended setup

```ts
import { createClient, resilientPreset, createMiddlewareDiagnostics } from "pureq";

const diagnostics = createMiddlewareDiagnostics();

let client = createClient({ baseURL: "/api" }).use(diagnostics.middleware);
for (const mw of resilientPreset()) {
  client = client.use(mw);
}

export { client, diagnostics };
```

## Query example

```ts
import { useQuery } from "@tanstack/react-query";
import { client } from "./httpClient";

export function useUser(userId: string) {
  return useQuery({
    queryKey: ["user", userId],
    queryFn: () =>
      client.getJson<{ id: string; name: string }>("/users/:id", {
        params: { id: userId },
      }),
  });
}
```

## Mutation example

```ts
import { useMutation } from "@tanstack/react-query";
import { client } from "./httpClient";

export function useCreateOrder() {
  return useMutation({
    mutationFn: (input: { productId: string }) =>
      client.postJson<{ id: string }>("/orders", input),
  });
}
```

## Error handling pattern

Use Result API when UI needs non-throwing behavior:

```ts
const result = await client.getJsonResult<{ id: string }>("/users/:id", {
  params: { id: "u1" },
});

if (!result.ok) {
  console.error(result.error.kind, result.error.metadata);
}
```
