# Integration Guide: SWR + pureq

Use pureq for transport policy and SWR for stale-while-revalidate UI state.

## Setup

```ts
import { createClient, resilientPreset } from "pureq";

let client = createClient({ baseURL: "/api" });
for (const mw of resilientPreset()) {
  client = client.use(mw);
}

export { client };
```

## SWR fetcher

```ts
import useSWR from "swr";
import { client } from "./httpClient";

const fetcher = <T,>(path: string) => client.getJson<T>(path);

export function useProjects() {
  return useSWR("/projects", fetcher<{ id: string; name: string }[]>);
}
```

## Non-throwing variant

```ts
const fetcherResult = async <T,>(path: string) => {
  const result = await client.getJsonResult<T>(path);
  if (!result.ok) {
    return { data: null, error: result.error };
  }
  return { data: result.data, error: null };
};
```

## Best practice

- Keep retry/circuit policy in pureq middleware
- Keep caching and revalidation policy in SWR
- Avoid duplicating retry strategies across both layers
