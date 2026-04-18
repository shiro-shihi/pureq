# @pureq/auth

**Type-safe, composable authentication layer for pureq**.

pureq is the policy-first TypeScript stack for explicit HTTP and auth behavior; `@pureq/*` packages are meant to compose that stack across client, server, and edge runtimes.

Unified handling of tokens, authentication schemes, credential refresh, and session lifecycle. Works seamlessly with pureq middleware stack and supports multiple auth paradigms (Bearer, Basic, OAuth2/OIDC, custom).

---

## Motivation

Raw HTTP token management is fragmented:

- Token refresh logic is often duplicated across middleware, interceptors, and effects
- Storage strategy is usually split across memory, browser storage, and cookies
- Logout propagation is easy to miss when several layers own their own state
- Token claims are frequently treated as opaque strings instead of typed input
- Concurrent refresh requests can create a thundering herd
- OIDC and BFF glue code tends to accumulate in app-specific handlers

**@pureq/auth** unifies these concerns:

- **Token-as-policy**: Auth is a composable middleware, not a side effect
- **Normalized storage**: Single API for localStorage, sessionStorage, memory, custom
- **Type-safe payloads**: Decode + validate token claims at use time
- **Lifecycle management**: Token expiry, pre-emptive refresh, logout propagation
- **Multi-scheme support**: Bearer, Basic, Custom headers, query param injection
- **Framework-agnostic**: Works with React, Vue, SPA, BFF, Node backends

## Auth.js Parity Gap List

This package already covers the core migration path, but the remaining Auth.js comparison gaps should stay visible while the surface grows:

- provider coverage still needs broader provider-specific validation, especially around callback quirks and provider metadata differences
- database adapter breadth still needs compatibility notes for real-world adapter edge cases
- account linking and multi-account lifecycle handling still need explicit workflow coverage
- UI handoff ergonomics still need to be evaluated against app-specific sign-in and bootstrap flows
- operational evidence still needs more load, replay, CSRF, and revocation stress data before treating the package as a drop-in replacement
- docs should continue to separate automatic security behavior from opt-in policy decisions

---

## Installation

```sh
npm install @pureq/auth
```

Requires `@pureq/pureq >= 1.1.0`.

### Peer Dependencies

| Package | Version | Optional | Note |
| --- | --- | --- | --- |
| `@pureq/pureq` | `^1.1.0` | No | Core client |
| `jsonwebtoken` | `^9.0.0` | Yes | For JWT decoding/validation |

---

## Quick Start

### 1. Bearer Token with Auto-Refresh

```ts
import { createClient } from "@pureq/pureq";
import { authBearer, authRefresh } from "@pureq/auth";

// Create a storage backend
const tokenStore = authMemoryStore();

// Create client with auth middleware
const api = createClient({ baseURL: "https://api.example.com" })
  .use(
    authBearer({
      getToken: () => tokenStore.get(),
      setToken: (token) => tokenStore.set(token),
    })
  )
  .use(
    authRefresh({
      triggerStatus: 401,
      refresh: async () => {
        const resp = await fetch("https://auth.example.com/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: await tokenStore.getRefresh() }),
        });
        const { accessToken } = await resp.json();
        return accessToken;
      },
    })
  );

// Use normally
const user = await api.getJson("/me");
```

### 2. Logout & Token Cleanup

```ts
async function logout() {
  // Clear local token store
  tokenStore.clear();

  // Optionally notify server
  await api.post("/auth/logout");

  // Reset client auth state
  api.auth.logout();
}
```

### 3. Pre-emptive Refresh (Before Expiry)

```ts
import { authBearer, withTokenLifecycle } from "@pureq/auth";

const api = createClient({ baseURL: "https://api.example.com" })
  .use(
    withTokenLifecycle({
      storage: tokenStore,
      refreshThresholdMs: 60_000, // Refresh 60s before expiry
      onRefreshNeeded: async () => {
        return await fetchNewToken();
      },
    })
  );
```

---

## What Is Included

- token storage: memory, localStorage, sessionStorage, cookie, custom, hybrid
- middleware: bearer, refresh, session, basic, custom, broadcast sync, token lifecycle
- OIDC flow: discovery, authorization URL, callback parsing, code exchange, refresh
- security: CSRF protection and revocation guard
- observability: session event exporters and event adapters
- concurrent refresh handling: in-flight refresh Promise deduplication inside authRefresh and session refreshIfNeeded
- SSR / BFF bridge: request bootstrap and cookie header helpers
- migration helpers: normalize legacy token snapshots into current session/storage
- setup presets: compose storage, session manager, and bridge into one reusable bundle
- request adapters: bootstrap a session from incoming requests and expose response cookie helpers
- framework hooks foundation: create a subscribable session store for React/Vue wrappers
- multi-tenant templates foundation: build tenant-scoped presets from one resolver
- contract coverage: storage, security, middleware, and OIDC boundary tests

## Architecture

### Storage Layer

How tokens are persisted. Implementations provided:

```ts
// In-memory (volatile, per-tab)
const store = authMemoryStore();

// LocalStorage (persistent cross-tab, browser)
const store = authLocalStorage({ prefix: "auth_" });

// SessionStorage (per-tab, volatile)
const store = authSessionStorage({ prefix: "auth_" });

// Custom backend (e.g., secure httpOnly cookie via server)
const store = authCustomStore({
  get: async () => document.cookie.match(/token=([^;]+)/)?.[1],
  set: async (token) => { /* ... */ },
  clear: async () => { /* ... */ },
});

// Hybrid: httpOnly cookie + in-memory access token
const store = authHybridStore({
  accessToken: authMemoryStore(),
  refreshToken: authCustomStore({ ... }),
});
```

### Middleware Stack Order

Recommended composition:

```ts
const api = createClient()
  // 1. Inject auth header (depends on current token)
  .use(authBearer({ getToken: () => tokenStore.get() }))
  
  // 2. Handle 401 + refresh token
  .use(authRefresh({ refresh: refreshTokenFn }))
  
  // 3. Non-auth reliability policies
  .use(retry({ maxRetries: 2 }))
  .use(circuitBreaker({}))
  .use(dedupe());
```

**Why this order?**
- Auth must be early (inject before other middleware transforms request)
- Refresh handles 401 before retry logic
- Retry/circuit after auth to avoid retrying auth failures

### Token Lifecycle

Three stages of a token:

```
[FRESH]                      [STALE]                    [EXPIRED]
  |                            |                           |
  |------ refreshThreshold -----|-- expiresIn -------------|
  |                            |                           |
  Ready for request    Refresh triggered      401 returned
                       (pre-emptive)          (reactive)
```

The library handles both:
1. **Reactive refresh**: Detect 401, refresh, retry request
2. **Proactive refresh**: Watch `exp` claim, refresh before expiry

---

## API Reference

### `authBearer(options)`

**Purpose**: Inject `Authorization: Bearer <token>` header.

```ts
export interface AuthBearerOptions {
  // Get current token (called per-request)
  readonly getToken: (req?: Readonly<RequestConfig>) => Promise<string | null> | string | null;

  // Custom header name (default: "Authorization")
  readonly header?: string;

  // Custom value formatter (default: `Bearer ${token}`)
  readonly formatValue?: (token: string) => string;

  // Optional: validate token before use
  readonly validate?: (token: string) => boolean | Promise<boolean>;
}

export function authBearer(options: AuthBearerOptions): Middleware;
```

**Example: Custom header**

```ts
const api = createClient()
  .use(authBearer({
    getToken: () => tokenStore.get(),
    header: "X-API-Token",
    formatValue: (token) => token, // no "Bearer " prefix
  }));
```

### `authRefresh(options)`

**Purpose**: Detect 401 response, refresh token, retry request.

```ts
export interface AuthRefreshOptions {
  // HTTP status that triggers refresh (default: 401)
  readonly triggerStatus?: number;

  // Function to fetch new token
  readonly refresh: () => Promise<string>;

  // Update request with new token
  readonly updateRequest?: (req: RequestConfig, newToken: string) => RequestConfig;

  // Max refresh attempts per request (default: 1)
  readonly maxAttempts?: number;

  // Called on refresh success
  readonly onSuccess?: (newToken: string) => Promise<void>;

  // Called on refresh failure
  readonly onFailure?: (error: Error) => Promise<void>;
}

export function authRefresh(options: AuthRefreshOptions): Middleware;
```

**Example: Custom token update**

```ts
const api = createClient()
  .use(authRefresh({
    refresh: async () => {
      const resp = await fetch("https://auth.example.com/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: tokenStore.getRefresh() }),
      });
      const { accessToken, refreshToken } = await resp.json();
      tokenStore.setRefresh(refreshToken); // Update refresh token too
      return accessToken;
    },
    onSuccess: async (token) => {
      console.log("Token refreshed, notifying other tabs...");
      broadcast("auth:token:refreshed", { token });
    },
    onFailure: async (error) => {
      console.error("Refresh failed, logging out...");
      await logout();
    },
  }));
```

### `withTokenLifecycle(options)`

**Purpose**: Watch token expiry, refresh proactively.

```ts
export interface TokenLifecycleOptions {
  // Token storage backend
  readonly storage: AuthStore;

  // Milliseconds before expiry to trigger refresh (default: 5 * 60_000)
  readonly refreshThresholdMs?: number;

  // Function to fetch new token
  readonly onRefreshNeeded: () => Promise<string>;

  // Called when token is about to expire
  readonly onStale?: () => void;

  // Called when token has expired
  readonly onExpired?: () => void;
}

export function withTokenLifecycle(
  options: TokenLifecycleOptions
): Middleware;
```

**Example: Watch expiry in background**

```ts
const api = createClient()
  .use(withTokenLifecycle({
    storage: tokenStore,
    refreshThresholdMs: 60_000,
    onRefreshNeeded: async () => {
      const resp = await refreshTokenEndpoint();
      return resp.accessToken;
    },
    onStale: () => console.warn("Token expiring soon"),
    onExpired: () => window.location.href = "/login",
  }));
```

### `authBasic(options)`

**Purpose**: Inject `Authorization: Basic <base64>` header.

```ts
export interface AuthBasicOptions {
  readonly username: string | (() => string | Promise<string>);
  readonly password: string | (() => string | Promise<string>);
  readonly header?: string; // default: "Authorization"
}

export function authBasic(options: AuthBasicOptions): Middleware;
```

**Example**

```ts
const api = createClient()
  .use(authBasic({
    username: "api_key",
    password: async () => await vault.getSecret("api_password"),
  }));
```

### `authCustom(options)`

**Purpose**: Inject custom auth header or query param.

```ts
export interface AuthCustomOptions {
  readonly header?: {
    name: string;
    value: string | (() => Promise<string>);
  };

  readonly queryParam?: {
    name: string;
    value: string | (() => Promise<string>);
  };
}

export function authCustom(options: AuthCustomOptions): Middleware;
```

**Example: API key as query param**

```ts
const api = createClient()
  .use(authCustom({
    queryParam: {
      name: "api_key",
      value: async () => await getApiKey(),
    },
  }));
```

### Storage Backends

#### `authMemoryStore()`

In-memory, per-tab, volatile.

```ts
const store = authMemoryStore();
store.set("token123");
const token = await store.get(); // "token123"
await store.clear();
```

#### `authLocalStorage(options?)`

Browser localStorage, persistent cross-tab.

```ts
const store = authLocalStorage({
  prefix: "myapp_", // Keys: myapp_accessToken, myapp_refreshToken
});
```

#### `authSessionStorage(options?)`

Browser sessionStorage, per-tab.

```ts
const store = authSessionStorage({ prefix: "session_" });
```

#### `authCustomStore(options)`

Bring your own storage (httpOnly cookie, secure enclave, etc.).

```ts
const store = authCustomStore({
  get: async () => {
    // Example: read from httpOnly cookie via server endpoint
    const resp = await fetch("/api/auth/token");
    return resp.ok ? resp.json().then(r => r.token) : null;
  },
  set: async (token) => {
    // Example: send to server to set httpOnly cookie
    await fetch("/api/auth/token", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },
  clear: async () => {
    await fetch("/api/auth/token", { method: "DELETE" });
  },
});
```

---

## Error Handling

### Auth-Specific Error Codes

| Code | When | Handling |
| --- | --- | --- |
| `PUREQ_AUTH_MISSING_TOKEN` | No token available in storage | User needs to login |
| `PUREQ_AUTH_INVALID_TOKEN` | Token validation failed (malformed, wrong sig) | Force re-login |
| `PUREQ_AUTH_REFRESH_FAILED` | Token refresh endpoint returned error | Logout + redirect to login |
| `PUREQ_AUTH_EXPIRED` | Token `exp` claim is in past | Refresh or logout |
| `PUREQ_AUTH_UNAUTHORIZED` | 401 after refresh (double 401) | Logout + redirect |

### Example: Error Recovery

```ts
try {
  const user = await api.getJson("/me");
} catch (error) {
  if (error.code === "PUREQ_AUTH_REFRESH_FAILED") {
    console.log("Refresh failed, logging out...");
    await logout();
    window.location.href = "/login";
  }
  if (error.code === "PUREQ_AUTH_EXPIRED") {
    console.log("Token expired, please login again");
    await logout();
  }
}
```

---

## Advanced Topics

### JWT Decoding & Validation

```ts
import { decodeJwt, verifyJwt } from "@pureq/auth";

const store = authMemoryStore();

const api = createClient()
  .use(authBearer({
    getToken: () => store.get(),
    validate: async (token) => {
      try {
        // Decode without verification (trust header)
        const claims = decodeJwt(token);

        // Check expiry
        if (claims.exp && claims.exp * 1000 < Date.now()) {
          console.log("Token expired");
          return false;
        }

        // Optional: verify signature (if you have issuer public key)
        // verifyJwt(token, publicKey);

        return true;
      } catch {
        return false;
      }
    },
  }));
```

### Multi-Tenant Auth (Per-Domain Token)

```ts
const api = createClient()
  .use(authBearer({
    getToken: async (req) => {
      // Select token based on request domain
      const domain = new URL(req.url).hostname;
      return tokenStore.get(domain);
    },
  }));
```

### Coordinating Refresh Across Tabs

```ts
import { authBearer, authRefresh, withBroadcastSync } from "@pureq/auth";

const api = createClient()
  .use(authBearer({ getToken: () => store.get() }))
  .use(authRefresh({ refresh: refreshFn }))
  .use(
    withBroadcastSync({
      // Coordinate token refresh across browser tabs
      channel: "auth:token",
      onRemoteRefresh: (newToken) => {
        store.set(newToken);
      },
    })
  );
```

### OIDC / OAuth2 Authorization Code Flow

```ts
import { createOIDCflow } from "@pureq/auth/oidc";

// Use dedicated OIDC module (separate export)
const oidc = createOIDCflow({
  clientId: "myapp",
  discoveryUrl: "https://auth.example.com/.well-known/openid-configuration",
  redirectUri: "https://myapp.example.com/callback",
});

// 1. Redirect to authorization endpoint
function login() {
  window.location.href = oidc.getAuthorizationUrl({
    scope: ["openid", "profile", "email"],
    state: generateRandomState(),
  });
}

// 2. Handle callback, exchange code for token
const code = new URLSearchParams(window.location.search).get("code");
const { accessToken, idToken, refreshToken } = await oidc.exchangeCode(code);

// 3. Use with pureq client
const store = authMemoryStore();
store.set(accessToken);

const api = createClient()
  .use(authBearer({ getToken: () => store.get() }))
  .use(authRefresh({
    refresh: async () => {
      const { accessToken } = await oidc.refresh(refreshToken);
      return accessToken;
    },
  }));
```

### Custom JWT Claims Extraction

```ts
import { decodeJwt } from "@pureq/auth";

// Type-safe claim extraction
interface AppClaims {
  sub: string;
  email: string;
  roles: string[];
  customField?: string;
}

async function getCurrentUser() {
  const token = await store.get();
  if (!token) return null;

  const claims = decodeJwt<AppClaims>(token);
  return {
    userId: claims.sub,
    email: claims.email,
    roles: claims.roles,
  };
}
```

---

## Integration Examples

### React + pureq + @pureq/auth

```tsx
import { createContext, useEffect, useState } from "react";
import { createClient } from "@pureq/pureq";
import { authBearer, authRefresh, authMemoryStore } from "@pureq/auth";

const store = authMemoryStore();

const api = createClient({ baseURL: "https://api.example.com" })
  .use(authBearer({ getToken: () => store.get() }))
  .use(authRefresh({
    refresh: async () => {
      const resp = await fetch("https://auth.example.com/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: sessionStorage.getItem("rt") }),
      });
      const { accessToken } = await resp.json();
      return accessToken;
    },
  }));

const AuthContext = createContext<typeof api>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Restore token from server on mount (from httpOnly cookie)
    async function restoreSession() {
      const resp = await fetch("https://api.example.com/auth/session");
      if (resp.ok) {
        const { accessToken } = await resp.json();
        store.set(accessToken);
      }
      setIsReady(true);
    }
    restoreSession();
  }, []);

  if (!isReady) return <div>Loading...</div>;

  return (
    <AuthContext.Provider value={api}>
      {children}
    </AuthContext.Provider>
  );
}

// Usage:
// <AuthProvider>
//   <App />
// </AuthProvider>
```

### Node.js Backend with Service Account

```ts
import { createClient } from "@pureq/pureq";
import { authBearer, authRefresh, authMemoryStore } from "@pureq/auth";
import { readFileSync } from "fs";

const store = authMemoryStore();

const googleApi = createClient({
  baseURL: "https://www.googleapis.com",
})
  .use(authBearer({ getToken: () => store.get() }))
  .use(authRefresh({
    refresh: async () => {
      // Use service account key to get new token
      const creds = JSON.parse(readFileSync("./service-account.json", "utf-8"));
      const resp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          refresh_token: creds.refresh_token,
          grant_type: "refresh_token",
        }).toString(),
      });
      const { access_token } = await resp.json();
      return access_token;
    },
  }));

// Use normally
const resp = await googleApi.getJson<any>("/calendar/v3/calendars/primary/events");
```

### TypeScript + Zod Schema Validation

```ts
import { z } from "zod";
import { createClient } from "@pureq/pureq";
import { authBearer } from "@pureq/auth";
import { decodeJwt } from "@pureq/auth";

const ClaimsSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  email_verified: z.boolean(),
  roles: z.array(z.string()).default([]),
  iat: z.number(),
  exp: z.number(),
});

type AppClaims = z.infer<typeof ClaimsSchema>;

async function validateTokenClaims(token: string): Promise<AppClaims | null> {
  try {
    const claims = decodeJwt(token);
    return ClaimsSchema.parse(claims);
  } catch {
    return null;
  }
}

const api = createClient()
  .use(authBearer({
    getToken: () => store.get(),
    validate: async (token) => {
      const claims = await validateTokenClaims(token);
      return claims !== null && claims.exp * 1000 > Date.now();
    },
  }));
```

---

## Migration Guide

### From Manual Fetch Wrapper

**Before:**

```ts
let token: string | null = null;

async function apiFetch(url: string, init?: RequestInit) {
  const headers = { ...init?.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, { ...init, headers });

  if (resp.status === 401) {
    // Manually refresh
    const refreshResp = await fetch("https://auth.example.com/refresh", {
      method: "POST",
    });
    token = await refreshResp.json().then(r => r.token);

    // Retry
    headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, { ...init, headers });
  }

  return resp;
}
```

**After:**

```ts
import { createClient } from "@pureq/pureq";
import { authBearer, authRefresh, authMemoryStore } from "@pureq/auth";

const store = authMemoryStore();
const api = createClient()
  .use(authBearer({ getToken: () => store.get() }))
  .use(authRefresh({
    refresh: async () => {
      const resp = await fetch("https://auth.example.com/refresh", {
        method: "POST",
      });
      const { token } = await resp.json();
      return token;
    },
  }));

// Use: const resp = await api.get("/users");
```

### From React Context + useState

**Before:**

```ts
const [user, setUser] = useState(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  async function bootstrap() {
    const token = sessionStorage.getItem("token");
    if (token) {
      setUser(decodeToken(token));
    }
    setLoading(false);
  }
  bootstrap();
}, []);
```

**After:**

```ts
const store = authMemoryStore();

useEffect(() => {
  async function bootstrap() {
    const resp = await fetch("/api/auth/session");
    if (resp.ok) {
      const { token } = await resp.json();
      store.set(token);
    }
    setLoading(false);
  }
  bootstrap();
}, []);
```

---

## Performance & Security

### Token Storage Best Practices

| Store | Pros | Cons | Use Case |
| --- | --- | --- | --- |
| **localStorage** | Persistent, simple | XSS vulnerable | Non-sensitive SPA |
| **sessionStorage** | Per-tab isolation | Volatile | SPA with session |
| **Memory** | No XSS exposure | Lost on reload | Short-lived SPA |
| **httpOnly Cookie** | XSS safe, CSRF protected | Server-set only | Secure backend apps |
| **Custom (Secure Enclave)** | Maximum control | Complex | Enterprise |

**Recommendation**: For SPAs, use memory + httpOnly cookie:

```ts
const store = authHybridStore({
  accessToken: authMemoryStore(),          // In-memory
  refreshToken: authCustomStore({
    // Server-managed httpOnly cookie
    get: () => fetch("/api/auth/token").then(r => r.json()),
    set: (token) => fetch("/api/auth/token", { method: "POST", body: JSON.stringify({ token }) }),
    clear: () => fetch("/api/auth/token", { method: "DELETE" }),
  }),
});
```

### Refresh Token Rotation

Rotation itself is policy-driven rather than automatic everywhere. The library can preserve, clear, or require an existing refresh token depending on the session `rotationPolicy`, while `authRefresh` deduplicates concurrent refreshes so one refresh response can fan out to all waiting requests.

```ts
const api = createClient()
  .use(authRefresh({
    refresh: async () => {
      const resp = await refreshEndpoint();
      const { accessToken, refreshToken: newRefreshToken } = resp;

      // Rotate refresh token (OAuth2 best practice)
      sessionStorage.setItem("rt", newRefreshToken);

      return accessToken;
    },
  }));
```

### Preventing Thundering Herd

The `authRefresh` middleware automatically deduplicates concurrent 401 errors within the same runtime:

```ts
// Multiple concurrent requests
const [user, posts, comments] = await Promise.all([
  api.get("/me"),
  api.get("/posts"),
  api.get("/comments"),
]);
// Result: Only 1 refresh, not 3
```

### Security Defaults vs Opt-In

- HttpOnly and Secure are enabled by default for cookie-backed storage.
- CSRF HMAC checks are available through the CSRF middleware and should be composed into browser-mutating flows.
- JWT verification rejects `alg:none` and malformed tokens during decode/verify paths.
- OIDC callback replay is blocked automatically with a TTL-based replay cache.
- Cross-tab sync is optional, and when enabled the `BroadcastChannel` payload is HMAC-signed.
- Token encryption is opt-in AES-256-GCM at-rest protection via encrypted stores, not a global default.

---

## Troubleshooting

### "Token Missing" on First Load

**Problem**: First request fails with `PUREQ_AUTH_MISSING_TOKEN`.

**Solution**: Bootstrap token before creating client:

```ts
async function initApi() {
  const resp = await fetch("/api/auth/session");
  if (resp.ok) {
    const { token } = await resp.json();
    store.set(token);
  }
  return createClient()
    .use(authBearer({ getToken: () => store.get() }));
}

const api = await initApi();
```

### "Infinite Refresh Loop"

**Problem**: `authRefresh` keeps retrying on 401.

**Solution**: Ensure `refresh()` actually returns a new valid token:

```ts
.use(authRefresh({
  refresh: async () => {
    const resp = await refreshEndpoint();
    if (!resp.ok) {
      throw new Error(`Refresh failed: ${resp.status}`);
    }
    const { accessToken } = await resp.json();
    console.log("Token refreshed successfully");
    return accessToken;
  },
  onFailure: async (error) => {
    console.error("Refresh failed permanently, logging out");
    await logout();
  },
}))
```

### Cross-Tab Coordination

**Problem**: Token refreshed in Tab A, but Tab B still has stale token.

**Solution**: Use `withBroadcastSync`:

```ts
.use(withBroadcastSync({
  channel: "auth:token",
  onRemoteRefresh: (newToken) => {
    console.log("Token updated by another tab");
    store.set(newToken);
  },
}))
```

### Session Event Operations

Use the session event exporter and audit pipeline guidance in:

- `docs/session_event_operations.md`

### Security Controls

Use the CSRF and revocation API guide in:

- `docs/security_controls.md`

### SSR / BFF Bridge

Use the framework-neutral session bridge guide in:

- `docs/ssr_bridge.md`

### Migration Guide

Use the legacy auth migration helpers in:

- `docs/migration_guide.md`

### Event Adapters

Use the callback adapter guide in:

- `docs/event_adapters.md`

### Error Code Reference

Use the complete auth error catalog in:

- `docs/error_code_reference.md`

---

## Roadmap

| Phase | Feature | ETA |
| --- | --- | --- |
| v0.1 | Core auth (Bearer, Basic, Custom) + refresh | Q2 2026 |
| v0.2 | JWT decode/validate + lifecycle management | Q2 2026 |
| v0.3 | OIDC module + multi-tenant support | Q3 2026 |
| v0.4 | Cross-tab broadcast sync + observability | Q3 2026 |
| v0.5 | React/Vue hooks + TypeScript inference | Q3 2026 |
| v1.0 | Stable API + production hardening | Q4 2026 |

---

## Contributing

Contributions welcome! See [pureq contributing guide](./README.md).

## Quality Gates

Use the following commands before release:

```sh
pnpm --filter @pureq/auth test:contract
pnpm --filter @pureq/auth test:ci
```

## License

MIT
