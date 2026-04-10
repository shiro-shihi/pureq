# Pureq Transport Policy Profile Generator

For teams standardizing `pureq` across large monorepos, a "Transport Policy Profile" dictates what middleware pipeline should be used for specific boundaries (Frontend to API, BFF to Backend service, Service to Service).

## Usage

Instead of requiring developers to manually string together `retry`, `dedupe`, `circuitBreaker`, etc., provide an internal generator or preset registry.

Currently, pureq ships with core presets: `frontendPreset`, `bffPreset`, `backendPreset`.

To generate a custom organizational preset, create a factory:

```typescript
import { createClient, retry, dedupe, deadline, piiRedactionOptions } from "pureq";

export function createAcmeFrontendClient(baseURL: string) {
  return createClient({ baseURL })
    .use(dedupe())
    .use(deadline({ defaultTimeoutMs: 5000 }))
    .use(retry({ maxRetries: 2 }))
    .useRequestInterceptor((req) => {
       // Attach global auth tokens, or set tracing headers
       return req;
    });
}
```

*CLI Generator features are planned for future releases to scaffolding these templates interactively.*
