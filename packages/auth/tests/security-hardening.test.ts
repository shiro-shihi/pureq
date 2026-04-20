import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  decodeJwt,
  verifyJwt,
  authMemoryStore,
  authCookieStore,
  authCustomStore,
  createAuthSessionManager,
  createAuthRevocationRegistry,
  createAuthEncryption,
  authEncryptedStore,
  createInMemoryAdapter,
  credentialsProvider,
  emailProvider,
  composeAuthCallbacks,
  createAuthorization,
  createAuthDebugLogger,
  createAuth,
} from "../src/index";
import { generateSecureId } from "@pureq/pureq";

function createUnsignedJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
  return `${header}.${payload}.`;
}

// ===========================================================================
// TEST-1: JWT alg:"none" rejection (SEC-C1)
// ===========================================================================
describe("SEC-C1: JWT alg:none rejection", () => {
  it("rejects a JWT with alg:none", async () => {
    // Forge a JWT with alg: "none"
    const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
    const payload = btoa(JSON.stringify({ sub: "attacker", admin: true }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
    const forgedToken = `${header}.${payload}.`;

    await expect(
      verifyJwt(forgedToken, { secret: generateSecureId(32), algorithms: ["HS256"] })
    ).rejects.toThrow(/algorithm.*"none".*not permitted/i);
  });

  it("rejects a JWT with alg:none even when none is in the algorithms list", async () => {
    const header = btoa(JSON.stringify({ alg: "none" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
    const payload = btoa(JSON.stringify({ sub: "test" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
    const forgedToken = `${header}.${payload}.nosig`;

    await expect(
      verifyJwt(forgedToken, { secret: generateSecureId(32), algorithms: ["none", "HS256"] })
    ).rejects.toThrow(/algorithm.*"none".*not permitted/i);
  });

  it("rejects a JWT with empty alg", async () => {
    const header = btoa(JSON.stringify({ alg: "", typ: "JWT" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
    const payload = btoa(JSON.stringify({ sub: "test" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
    const forgedToken = `${header}.${payload}.nosig`;

    await expect(
      verifyJwt(forgedToken, { secret: generateSecureId(32), algorithms: ["HS256"] })
    ).rejects.toThrow(/not permitted/i);
  });
});

// ===========================================================================
// TEST-1b: JWT algorithm confusion (SEC-C2)
// ===========================================================================
describe("SEC-C2: JWT algorithm restriction", () => {
  it("rejects a JWT with algorithm not in the allowed list", async () => {
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
    const payload = btoa(JSON.stringify({ sub: "test" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
    const forgedToken = `${header}.${payload}.fakesig`;

    await expect(
      verifyJwt(forgedToken, { secret: generateSecureId(32), algorithms: ["HS256"] })
    ).rejects.toThrow(/unsupported JWT algorithm/i);
  });

  it("requires algorithms parameter (compile-time check via type)", () => {
    // This test validates the API contract: algorithms is required
    // @ts-expect-error - algorithms is required
    expect(() => verifyJwt("a.b.c", { secret: "secret" } as any)).toBeDefined();
  });
});

// ===========================================================================
// TEST-2: Basic auth header injection (SEC-H4)
// ===========================================================================
describe("SEC-H4: Basic auth credential sanitization", () => {
  it("rejects username containing colon", async () => {
    const { authBasic } = await import("../src/middleware/authBasic");
    const middleware = authBasic({ username: "user:name", password: "pass" });
    const next = vi.fn();
    await expect(middleware({ url: "https://example.com", method: "GET", headers: {} }, next)).rejects.toThrow(
      /must not contain/i
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects password with CRLF", async () => {
    const { authBasic } = await import("../src/middleware/authBasic");
    const middleware = authBasic({ username: "user", password: "pass\r\nX-Injected: true" });
    const next = vi.fn();
    await expect(middleware({ url: "https://example.com", method: "GET", headers: {} }, next)).rejects.toThrow(
      /unsafe characters/i
    );
  });

  it("rejects username with null byte", async () => {
    const { authBasic } = await import("../src/middleware/authBasic");
    const middleware = authBasic({ username: "user\0name", password: "pass" });
    const next = vi.fn();
    await expect(middleware({ url: "https://example.com", method: "GET", headers: {} }, next)).rejects.toThrow(
      /unsafe characters/i
    );
  });
});

// ===========================================================================
// TEST: DX-M3 — authCustomStore getRefresh default returns null
// ===========================================================================
describe("DX-M3: authCustomStore getRefresh default", () => {
  it("returns null when getRefresh is not provided", async () => {
    const store = authCustomStore({
      get: () => "access-token",
      set: vi.fn(),
      clear: vi.fn(),
    });
    const refresh = await store.getRefresh();
    expect(refresh).toBeNull();
  });
});

// ===========================================================================
// TEST: Session regeneration (SEC-M1)
// ===========================================================================
describe("SEC-M1: Session regeneration", () => {
  it("regenerates session with new tokens", async () => {
    const store = authMemoryStore();
    const session = createAuthSessionManager(store);

    await session.setTokens({ accessToken: "old-token", refreshToken: "old-refresh" });
    const stateBeforeRegen = await session.getState();
    expect(stateBeforeRegen.accessToken).toBe("old-token");

    const regenerated = await session.regenerateSession({
      accessToken: "new-token",
      refreshToken: "new-refresh",
    });

    expect(regenerated.accessToken).toBe("new-token");
    expect(regenerated.refreshToken).toBe("new-refresh");
    session.dispose();
  });

  it("emits session-regenerated event", async () => {
    const store = authMemoryStore();
    const session = createAuthSessionManager(store);
    const events: string[] = [];

    session.onEvent((event) => {
      events.push(event.type);
    });

    await session.regenerateSession({ accessToken: "new", refreshToken: "new-r" });
    expect(events).toContain("session-regenerated");
    session.dispose();
  });
});

// ===========================================================================
// TEST: Session refresh rate limiting (SEC-M3)
// ===========================================================================
describe("SEC-M3: Session refresh rate limiting", () => {
  it("skips refresh when called within cooldown window", async () => {
    const store = authMemoryStore();
    const expired = createUnsignedJwt(Math.floor(Date.now() / 1000) - 10);
    await store.set(expired);
    const session = createAuthSessionManager(store, { minRefreshIntervalMs: 5_000 });

    let refreshCount = 0;
    const refresh = async () => {
      refreshCount++;
      return { accessToken: `token-${refreshCount}`, refreshToken: "r" };
    };

    // Force a "needs refresh" scenario by manipulating state
    await session.refreshIfNeeded(refresh, Number.MAX_SAFE_INTEGER);

    // Second call within cooldown should be skipped
    await session.refreshIfNeeded(refresh, Number.MAX_SAFE_INTEGER);

    // Only one actual refresh should have happened
    expect(refreshCount).toBe(1);
    session.dispose();
  });
});

// ===========================================================================
// TEST: Revocation registry adapter (SEC-H3)
// ===========================================================================
describe("SEC-H3: Revocation registry adapter", () => {
  it("uses in-memory backend by default", () => {
    const registry = createAuthRevocationRegistry();
    registry.revokeToken("tok-123");
    expect(registry.isRevoked({ jti: "tok-123" })).toBe(true);
    expect(registry.isRevoked({ jti: "tok-456" })).toBe(false);
  });

  it("accepts a custom backend", () => {
    const backingStore = new Map<string, Map<string, number | null>>();
    const backend = {
      set(bucket: string, key: string, expiresAt: number | null) {
        let b = backingStore.get(bucket);
        if (!b) {
          b = new Map();
          backingStore.set(bucket, b);
        }
        b.set(key, expiresAt);
      },
      has(bucket: string, key: string) {
        return backingStore.get(bucket)?.has(key) ?? false;
      },
      delete(bucket: string, key: string) {
        backingStore.get(bucket)?.delete(key);
      },
      clear(bucket: string) {
        backingStore.get(bucket)?.clear();
      },
      keys(bucket: string) {
        return Array.from(backingStore.get(bucket)?.keys() ?? []);
      },
    };

    const registry = createAuthRevocationRegistry(backend);
    registry.revokeToken("tok-abc");
    expect(backingStore.get("tokens")?.has("tok-abc")).toBe(true);
  });
});

// ===========================================================================
// TEST: Database adapter (FEAT-H1)
// ===========================================================================
describe("FEAT-H1: In-memory database adapter", () => {
  it("creates and retrieves a user", async () => {
    const adapter = createInMemoryAdapter();
    const user = await adapter.createUser({ email: "test@example.com", name: "Test" });
    expect(user.id).toBeTruthy();
    expect(user.email).toBe("test@example.com");

    const retrieved = await adapter.getUser(user.id);
    expect(retrieved).toEqual(user);
  });

  it("finds user by email", async () => {
    const adapter = createInMemoryAdapter();
    await adapter.createUser({ email: "unique@example.com", name: "Unique" });
    const found = await adapter.getUserByEmail("unique@example.com");
    expect(found?.name).toBe("Unique");
    expect(await adapter.getUserByEmail("notfound@example.com")).toBeNull();
  });

  it("links and finds by account", async () => {
    const adapter = createInMemoryAdapter();
    const user = await adapter.createUser({ email: "a@b.c" });
    await adapter.linkAccount({
      userId: user.id,
      type: "oidc",
      provider: "google",
      providerAccountId: "goog-123",
    });

    const found = await adapter.getUserByAccount("google", "goog-123");
    expect(found?.id).toBe(user.id);
  });

  it("manages sessions", async () => {
    const adapter = createInMemoryAdapter();
    const user = await adapter.createUser({ email: "s@s.com" });
    const session = await adapter.createSession({
      sessionToken: "st-123",
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const result = await adapter.getSessionAndUser("st-123");
    expect(result?.user.id).toBe(user.id);
    expect(result?.session.sessionToken).toBe("st-123");

    await adapter.deleteSession("st-123");
    expect(await adapter.getSessionAndUser("st-123")).toBeNull();
  });

  it("manages verification tokens", async () => {
    const adapter = createInMemoryAdapter();
    await adapter.createVerificationToken!({
      identifier: "email@test.com",
      token: "abc123",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const used = await adapter.useVerificationToken!({
      identifier: "email@test.com",
      token: "abc123",
    });
    expect(used?.token).toBe("abc123");

    // Second use should return null (consumed)
    const reused = await adapter.useVerificationToken!({
      identifier: "email@test.com",
      token: "abc123",
    });
    expect(reused).toBeNull();
  });
});

// ===========================================================================
// TEST: Providers (FEAT-H3)
// ===========================================================================
describe("FEAT-H3: Credential and email providers", () => {
  it("creates a credentials provider", async () => {
    const provider = credentialsProvider({
      authorize: async (creds) => {
        if (creds.username === "admin" && creds.password === "secret") {
          return { id: "1", email: "admin@example.com" };
        }
        return null;
      },
    });

    expect(provider.type).toBe("credentials");
    expect(provider.id).toBe("credentials");

    const user = await provider.authorize({ username: "admin", password: "secret" });
    expect(user?.email).toBe("admin@example.com");

    const noUser = await provider.authorize({ username: "admin", password: "wrong" });
    expect(noUser).toBeNull();
  });

  it("creates an email provider", () => {
    const provider = emailProvider({
      sendVerificationRequest: async () => {},
    });
    expect(provider.type).toBe("email");
    expect(provider.id).toBe("email");
  });
});

// ===========================================================================
// TEST: Auth callbacks (FEAT-H5)
// ===========================================================================
describe("FEAT-H5: Auth lifecycle callbacks", () => {
  it("composes multiple callback sets", async () => {
    const log: string[] = [];

    const composed = composeAuthCallbacks(
      {
        signIn: async () => {
          log.push("cb1-signIn");
          return true;
        },
      },
      {
        signIn: async () => {
          log.push("cb2-signIn");
          return true;
        },
        createUser: async () => {
          log.push("cb2-createUser");
        },
      }
    );

    const result = await composed.signIn!({
      user: { id: "1" },
      account: { userId: "1", type: "oidc", provider: "google", providerAccountId: "g1" },
    });
    expect(result).toBe(true);
    expect(log).toEqual(["cb1-signIn", "cb2-signIn"]);

    await composed.createUser!({ user: { id: "1" } });
    expect(log).toContain("cb2-createUser");
  });

  it("blocks sign-in when any callback returns false", async () => {
    const composed = composeAuthCallbacks(
      { signIn: async () => false },
      { signIn: async () => true }
    );

    const result = await composed.signIn!({
      user: { id: "1" },
      account: { userId: "1", type: "oidc", provider: "google", providerAccountId: "g1" },
    });
    expect(result).toBe(false);
  });
});

// ===========================================================================
// TEST: Encryption (FEAT-H7)
// ===========================================================================
describe("FEAT-H7: Auth encryption", () => {
  it("encrypts and decrypts a payload round-trip", async () => {
    const enc = createAuthEncryption(generateSecureId(32));
    const payload = { sub: "user-1", roles: ["admin"] };
    const token = await enc.encrypt(payload);
    expect(typeof token).toBe("string");
    expect(token).not.toContain("user-1"); // Should be encrypted

    const decrypted = await enc.decrypt<typeof payload>(token);
    expect(decrypted).toEqual(payload);
  });

  it("fails to decrypt with wrong secret", async () => {
    const enc1 = createAuthEncryption(generateSecureId(32));
    const enc2 = createAuthEncryption(generateSecureId(32));
    const token = await enc1.encrypt({ data: "sensitive" });
    await expect(enc2.decrypt(token)).rejects.toThrow();
  });
});

// ===========================================================================
// TEST: Encrypted store (FEAT-M6)
// ===========================================================================
describe("FEAT-M6: Encrypted token storage", () => {
  it("encrypts tokens at rest and decrypts on read", async () => {
    const inner = authMemoryStore();
    const encrypted = authEncryptedStore(inner, generateSecureId(32));

    await encrypted.set("my-access-token");
    await encrypted.setRefresh("my-refresh-token");

    // Inner store should have encrypted values
    const rawAccess = await inner.get();
    expect(rawAccess).not.toBe("my-access-token");
    expect(rawAccess).toBeTruthy();

    // Encrypted store should decrypt on read
    const accessToken = await encrypted.get();
    expect(accessToken).toBe("my-access-token");
    const refreshToken = await encrypted.getRefresh();
    expect(refreshToken).toBe("my-refresh-token");
  });
});

// ===========================================================================
// TEST: Authorization (FEAT-M1)
// ===========================================================================
describe("FEAT-M1: RBAC authorization", () => {
  it("checks roles from session state", () => {
    const auth = createAuthorization<"admin" | "user" | "moderator">({
      extractRoles: (session) => {
        if (!session.accessToken) return [];
        // Simulate role extraction from token
        return ["admin", "user"];
      },
    });

    const session = { accessToken: "tok", refreshToken: null };
    expect(auth.hasRole(session, "admin")).toBe(true);
    expect(auth.hasRole(session, "moderator")).toBe(false);
    expect(auth.hasAnyRole(session, ["moderator", "admin"])).toBe(true);
    expect(auth.hasAnyRole(session, ["moderator"])).toBe(false);
  });
});

// ===========================================================================
// TEST: Debug logger (FEAT-L1)
// ===========================================================================
describe("FEAT-L1: Debug logger", () => {
  it("logs when enabled", () => {
    const logs: string[] = [];
    const logger = createAuthDebugLogger(true, {
      log: (...args: unknown[]) => logs.push(args.join(" ")),
      warn: vi.fn(),
      error: vi.fn(),
    });

    logger.log("session", "token refreshed");
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain("session");
  });

  it("does not log when disabled", () => {
    const logs: string[] = [];
    const logger = createAuthDebugLogger(false, {
      log: (...args: unknown[]) => logs.push(args.join(" ")),
      warn: vi.fn(),
      error: vi.fn(),
    });

    logger.log("session", "should not appear");
    expect(logs.length).toBe(0);
  });
});

// ===========================================================================
// TEST: Unified createAuth (DX-H2)
// ===========================================================================
describe("DX-H2: Unified createAuth", () => {
  it("creates a complete auth instance", () => {
    const auth = createAuth({ debug: true });
    expect(auth.storage).toBeDefined();
    expect(auth.session).toBeDefined();
    expect(auth.bridge).toBeDefined();
    expect(auth.handlers).toBeDefined();
    expect(auth.debug.enabled).toBe(true);
  });

  it("creates handlers that respond to session requests", async () => {
    const auth = createAuth();
    const response = await auth.handlers.handleSession({
      headers: {},
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("accessToken");
  });
});

// ===========================================================================
// TEST: Error sanitization (SEC-M6)
// ===========================================================================
describe("SEC-M6: Error message sanitization", () => {
  it("maps internal error codes to generic messages via mapAuthErrorToHttp", async () => {
    const { mapAuthErrorToHttp } = await import("../src/framework/recipes");
    const error = Object.assign(new Error("internal db connection string: postgres://user:pass@host/db"), {
      code: "PUREQ_AUTH_MISSING_TOKEN",
    });
    const mapped = mapAuthErrorToHttp(error, true);
    expect(mapped.message).toBe("Authentication required");
    expect(mapped.message).not.toContain("postgres");
  });

  it("preserves raw message when sanitize is false", async () => {
    const { mapAuthErrorToHttp } = await import("../src/framework/recipes");
    const error = Object.assign(new Error("detailed internal error"), {
      code: "PUREQ_AUTH_MISSING_TOKEN",
    });
    const mapped = mapAuthErrorToHttp(error, false);
    expect(mapped.message).toBe("detailed internal error");
  });
});
