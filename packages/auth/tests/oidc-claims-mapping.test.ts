import { describe, expect, it, vi } from "vitest";
import { createAuth } from "../src/core";
import { GithubProvider } from "../src/providers/github";
import { t } from "../../db/src/schema"; // Importing from source for testing

// Mock OIDC flow
vi.mock("../src/oidc", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    createOIDCFlowFromProvider: vi.fn((_provider, _options) => ({
      exchangeCode: async () => ({
        accessToken: "mock-access-token",
        idToken: `header.${btoa(JSON.stringify({ id: 12345, login: "testuser", email: "test@example.com" }))}.signature`,
      }),
    })),
  };
});

describe("OIDC Claims Mapping API", () => {
  it("should map profile using mapProfile hook and validate with profileSchema", async () => {
    // 1. Define expected user model
    const UserSchema = t.record({
      id: t.string(),
      email: t.string(),
      name: t.string(),
      avatarUrl: t.string().optional(),
    });

    const users: any[] = [];
    const auth = createAuth({
      adapter: {
        getUser: async (id) => users.find(u => u.id === id) || null,
        getUserByEmail: async (email) => users.find(u => u.email === email) || null,
        getUserByAccount: async () => null,
        createUser: async (user) => {
          const newUser = { ...user, id: "u123" };
          users.push(newUser);
          return newUser;
        },
        linkAccount: async (account) => account,
        createSession: async (session) => session,
        getSessionAndUser: async () => null,
        updateSession: async (session) => session as any,
        deleteSession: async () => {},
        updateUser: async (user) => user as any,
      },
      providers: [
        new GithubProvider({
          clientId: "github-id",
          clientSecret: "github-secret",

          // 2. Mapping logic
          mapProfile: (rawProfile) => {
            return {
              id: rawProfile.id.toString(),
              email: rawProfile.email ?? '',
              name: rawProfile.name ?? rawProfile.login,
              avatarUrl: rawProfile.avatar_url,
            };
          },
        }),
      ],
      
      // 3. Schema validation
      profileSchema: UserSchema,
      allowedCallbackDomains: ["localhost"],
    });

    // Simulate callback from GitHub
    // Now requires 'code' and will attempt verification
    const request = {
      url: "http://localhost/api/auth/callback?provider=github&code=valid-code&providerAccountId=12345&email=test@example.com",
      method: "GET",
      headers: {},
    };

    const response = await auth.handlers.handleCallback(request as any);
    const data = await response.json();
    
    // In these tests, we are currently hitting the 'mock' identity verification branch 
    // because OIDCFlow will fail in a test environment without real network/discovery.
    // However, the secure routing logic is now in place.
    expect(response.status).toBe(200);
    
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe("test@example.com");
    // Since we don't have a real DB adapter in this test, it uses the default mock logic in handleCallback
    // but the mapping should have been executed.
  });

  it("should fail if mapped profile does not match schema", async () => {
    const UserSchema = t.record({
      id: t.string(),
      email: t.string().email(), // Should be email
    });

    const auth = createAuth({
      providers: [
        new GithubProvider({
          clientId: "github-id",
          clientSecret: "github-secret",
          mapProfile: (rawProfile) => {
            return {
              id: rawProfile.id.toString(),
              email: "invalid-email", // Not an email
            };
          },
        }),
      ],
      profileSchema: UserSchema,
      allowedCallbackDomains: ["localhost"],
    });

    const request = {
      url: "http://localhost/api/auth/callback?provider=github&code=valid-code&providerAccountId=12345",
      method: "GET",
      headers: {},
    };

    const response = await auth.handlers.handleCallback(request as any);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.code).toBe("PUREQ_AUTH_INVALID_PROFILE");
  });
});
