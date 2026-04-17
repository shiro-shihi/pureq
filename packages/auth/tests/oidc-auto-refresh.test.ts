import { describe, expect, it, vi } from "vitest";
import { refreshOIDCAccountIfNeeded, refreshStoredOIDCAccountIfNeeded } from "../src/oidc";

describe("refreshOIDCAccountIfNeeded", () => {
  it("refreshes oauth account when token expiry is near", async () => {
    const flow = {
      refresh: vi.fn(async () => ({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresIn: 3600,
        tokenType: "Bearer",
      })),
    };

    const now = 1_700_000_000_000;
    const result = await refreshOIDCAccountIfNeeded(
      {
        userId: "u1",
        type: "oauth",
        provider: "google",
        providerAccountId: "google-1",
        accessToken: "old-access",
        refreshToken: "old-refresh",
        expiresAt: Math.floor((now + 30_000) / 1000),
      },
      {
        flow,
        refreshThresholdSeconds: 90,
        now: () => now,
      }
    );

    expect(result.refreshed).toBe(true);
    expect(result.account.accessToken).toBe("new-access");
    expect(result.account.refreshToken).toBe("new-refresh");
    expect(flow.refresh).toHaveBeenCalledTimes(1);
  });

  it("skips refresh when account is still valid", async () => {
    const flow = {
      refresh: vi.fn(async () => ({ accessToken: "new-access" })),
    };

    const now = 1_700_000_000_000;
    const result = await refreshOIDCAccountIfNeeded(
      {
        userId: "u1",
        type: "oidc",
        provider: "google",
        providerAccountId: "google-1",
        accessToken: "old-access",
        refreshToken: "old-refresh",
        expiresAt: Math.floor((now + 30 * 60_000) / 1000),
      },
      {
        flow,
        refreshThresholdSeconds: 60,
        now: () => now,
      }
    );

    expect(result.refreshed).toBe(false);
    expect(flow.refresh).not.toHaveBeenCalled();
  });

  it("refreshes and persists stored account when adapter supports account methods", async () => {
    const store = {
      userId: "u1",
      type: "oauth" as const,
      provider: "google",
      providerAccountId: "google-1",
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: Math.floor((1_700_000_000_000 + 10_000) / 1000),
    };

    const adapter = {
      getAccount: vi.fn(async () => store),
      updateAccountIfMatch: vi.fn(async ({ next }) => next),
      updateAccount: vi.fn(async (next) => next),
    };

    const result = await refreshStoredOIDCAccountIfNeeded({
      adapter,
      provider: "google",
      providerAccountId: "google-1",
      flow: {
        refresh: async () => ({
          accessToken: "new-access",
          refreshToken: "new-refresh",
          expiresIn: 3600,
        }),
      },
      refreshThresholdSeconds: 60,
      now: () => 1_700_000_000_000,
    });

    expect(result.refreshed).toBe(true);
    expect(result.account?.accessToken).toBe("new-access");
    expect(adapter.updateAccountIfMatch).toHaveBeenCalledTimes(1);
    expect(adapter.updateAccount).not.toHaveBeenCalled();
  });

  it("returns conflict when compare-and-swap update fails", async () => {
    const adapter = {
      getAccount: vi.fn(async () => ({
        userId: "u1",
        type: "oauth" as const,
        provider: "google",
        providerAccountId: "google-1",
        accessToken: "other-access",
        refreshToken: "other-refresh",
        expiresAt: Math.floor((1_700_000_000_000 + 10_000) / 1000),
      })),
      updateAccountIfMatch: vi.fn(async () => null),
    };

    const result = await refreshStoredOIDCAccountIfNeeded({
      adapter,
      provider: "google",
      providerAccountId: "google-1",
      flow: {
        refresh: async () => ({
          accessToken: "new-access",
          refreshToken: "new-refresh",
          expiresIn: 3600,
        }),
      },
      refreshThresholdSeconds: 60,
      now: () => 1_700_000_000_000,
    });

    expect(result.refreshed).toBe(false);
    expect(result.conflict).toBe(true);
    expect(adapter.updateAccountIfMatch).toHaveBeenCalledTimes(1);
  });
});
