import { describe, expect, it } from "vitest";
import { createAuth } from "../src/core";
import { createInMemoryAdapter } from "../src/adapter";
import { credentialsProvider, emailProvider } from "../src/providers";

function toCookieHeader(setCookieHeaders: readonly string[]): string {
  return setCookieHeaders.map((value) => value.split(";")[0]).join("; ");
}

function toSessionToken(accessToken: string | null | undefined): string | null {
  if (!accessToken || !accessToken.startsWith("session:")) {
    return null;
  }
  return accessToken.slice("session:".length);
}

async function settleBroadcastTasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("core auth handlers", () => {
  it("returns configured providers on sign-in GET", async () => {
    const auth = createAuth({
      providers: [
        credentialsProvider({
          authorize: async () => ({ id: "u1", email: "u1@example.com" }),
        }),
      ],
    });

    const response = await auth.handlers.handleSignIn({ method: "GET", headers: {} });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.providers).toEqual([
      {
        id: "credentials",
        name: "Credentials",
        type: "credentials",
      },
    ]);

    await settleBroadcastTasks();
    auth.session.dispose();
  });

  it("creates adapter-backed session for credentials sign-in", async () => {
    const adapter = createInMemoryAdapter();
    const auth = createAuth({
      adapter,
      providers: [
        credentialsProvider({
          authorize: async (credentials) => {
            if (credentials.username === "alice" && credentials.password === "secret") {
              return { id: "user-alice", email: "alice@example.com", name: "Alice" };
            }
            return null;
          },
        }),
      ],
    });

    const signIn = await auth.handlers.handleSignIn({
      method: "POST",
      headers: {},
      body: {
        provider: "credentials",
        credentials: {
          username: "alice",
          password: "secret",
        },
      },
    });

    expect(signIn.status).toBe(200);
    const signInBody = await signIn.json();
    expect(signInBody.ok).toBe(true);
    expect(signInBody.user.email).toBe("alice@example.com");

    const state = await auth.session.getState();
    const cookieHeader = toCookieHeader(auth.bridge.buildSetCookieHeaders(state));

    const sessionResponse = await auth.handlers.handleSession({
      headers: {
        cookie: cookieHeader,
      },
    });

    expect(sessionResponse.status).toBe(200);
    const sessionBody = await sessionResponse.json();
    expect(sessionBody.accessToken).toBeTruthy();
    expect(sessionBody.user.email).toBe("alice@example.com");

    await settleBroadcastTasks();
    auth.session.dispose();
  });

  it("links account on callback and deletes persisted session on sign-out", async () => {
    const adapter = createInMemoryAdapter();
    const auth = createAuth({
      adapter,
      allowDangerousAccountLinking: true,
    });

    const callback = await auth.handlers.handleCallback({
      headers: {},
      url: "https://app.example.com/auth/callback?provider=google&type=oidc&providerAccountId=google-acc-1&email=linked@example.com",
    });

    expect(callback.status).toBe(200);
    const callbackBody = await callback.json();
    expect(callbackBody.ok).toBe(true);
    expect(callbackBody.user.email).toBe("linked@example.com");

    const linkedUser = await adapter.getUserByAccount("google", "google-acc-1");
    expect(linkedUser?.email).toBe("linked@example.com");

    const state = await auth.session.getState();
    const sessionToken = toSessionToken(state.accessToken);
    expect(sessionToken).toBeTruthy();

    const beforeSignOut = await adapter.getSessionAndUser(sessionToken!);
    expect(beforeSignOut?.user.email).toBe("linked@example.com");

    const cookieHeader = toCookieHeader(auth.bridge.buildSetCookieHeaders(state));
    const signOut = await auth.handlers.handleSignOut({
      headers: {
        cookie: cookieHeader,
      },
    });

    expect(signOut.status).toBe(200);

    const afterSignOut = await adapter.getSessionAndUser(sessionToken!);
    expect(afterSignOut).toBeNull();

    await settleBroadcastTasks();
    auth.session.dispose();
  });

  it("returns 401 when credentials are invalid", async () => {
    const auth = createAuth({
      providers: [
        credentialsProvider({
          authorize: async () => null,
        }),
      ],
    });

    const response = await auth.handlers.handleSignIn({
      method: "POST",
      headers: {},
      body: {
        provider: "credentials",
        credentials: {
          username: "alice",
          password: "wrong",
        },
      },
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("PUREQ_AUTH_INVALID_CREDENTIALS");

    await settleBroadcastTasks();
    auth.session.dispose();
  });

  it("returns 401 when callback account linking is not explicitly allowed", async () => {
    const adapter = createInMemoryAdapter();
    const existing = await adapter.createUser({ email: "owner@example.com" });
    await adapter.linkAccount({
      userId: existing.id,
      provider: "github",
      providerAccountId: "existing-acc",
      type: "oauth",
    });

    const auth = createAuth({
      adapter,
    });

    const response = await auth.handlers.handleCallback({
      headers: {},
      url: "https://app.example.com/auth/callback?provider=google&type=oidc&providerAccountId=new-google-acc&email=owner@example.com",
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("PUREQ_AUTH_UNAUTHORIZED");

    const notLinked = await adapter.getUserByAccount("google", "new-google-acc");
    expect(notLinked).toBeNull();

    await settleBroadcastTasks();
    auth.session.dispose();
  });

  it("issues session from email magic-link callback and rejects token reuse", async () => {
    const adapter = createInMemoryAdapter();
    const captured: { url: string; token: string; identifier: string }[] = [];

    const auth = createAuth({
      adapter,
      providers: [
        emailProvider({
          sendVerificationRequest: async (params) => {
            captured.push(params);
          },
        }),
      ],
    });

    const signIn = await auth.handlers.handleSignIn({
      method: "POST",
      headers: {},
      body: {
        provider: "email",
        email: "magic@example.com",
        callbackUrl: "https://app.example.com/auth/callback",
      },
    });

    expect(signIn.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.url).toContain("provider=email");

    const callback = await auth.handlers.handleCallback({
      headers: {},
      url: captured[0]!.url,
    });

    expect(callback.status).toBe(200);
    const callbackBody = await callback.json();
    expect(callbackBody.ok).toBe(true);
    expect(callbackBody.provider).toBe("email");
    expect(callbackBody.user.email).toBe("magic@example.com");

    const secondUse = await auth.handlers.handleCallback({
      headers: {},
      url: captured[0]!.url,
    });
    expect(secondUse.status).toBe(401);
    const secondBody = await secondUse.json();
    expect(secondBody.error.code).toBe("PUREQ_AUTH_UNAUTHORIZED");

    await settleBroadcastTasks();
    auth.session.dispose();
  });
});
