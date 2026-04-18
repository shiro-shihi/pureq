import { describe, expect, it } from "vitest";
import { createInMemoryAdapter, probeAdapterCapabilities, assessAdapterReadiness } from "../src/adapter";

describe("adapter capability probe", () => {
  it("reports level-a for in-memory adapter", () => {
    const adapter = createInMemoryAdapter();
    const report = probeAdapterCapabilities(adapter);

    expect(report.level).toBe("level-a");
    expect(report.hasCoreUserMethods).toBe(true);
    expect(report.hasCoreAccountMethods).toBe(true);
    expect(report.hasCoreSessionMethods).toBe(true);
    expect(report.hasVerificationTokenMethods).toBe(true);
    expect(report.missingRequired).toHaveLength(0);
  });

  it("reports missing methods for minimal adapters", () => {
    const minimal = {
      createUser: async () => ({ id: "u1" }),
      getUser: async () => null,
      getUserByEmail: async () => null,
      getUserByAccount: async () => null,
      updateUser: async (user: { id: string }) => user,
      linkAccount: async (account: unknown) => account,
      createSession: async (session: unknown) => session,
      getSessionAndUser: async () => null,
      updateSession: async () => null,
      deleteSession: async () => {},
    } as any;

    const report = probeAdapterCapabilities(minimal);

    expect(report.level).toBe("level-b");
    expect(report.missingRequired).toEqual([]);
    expect(report.missingRecommended).toEqual(expect.arrayContaining(["deleteUser", "unlinkAccount", "createVerificationToken", "useVerificationToken"]));
  });
});

describe("verification token one-time consume", () => {
  it("consumes verification token only once under concurrent consume attempts", async () => {
    const adapter = createInMemoryAdapter();
    await adapter.createVerificationToken!({
      identifier: "concurrent@example.com",
      token: "tok-concurrent",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const [a, b] = await Promise.all([
      adapter.useVerificationToken!({ identifier: "concurrent@example.com", token: "tok-concurrent" }),
      adapter.useVerificationToken!({ identifier: "concurrent@example.com", token: "tok-concurrent" }),
    ]);

    const successCount = [a, b].filter((v) => v !== null).length;
    expect(successCount).toBe(1);
  });
});

describe("adapter readiness assessment", () => {
  it("marks in-memory adapter as ready in development", () => {
    const adapter = createInMemoryAdapter();
    const report = assessAdapterReadiness(adapter, { deployment: "development" });

    expect(report.status).toBe("ready");
    expect(report.blockers).toHaveLength(0);
  });

  it("marks minimal adapter as blocked when email support is required", () => {
    const minimal = {
      createUser: async () => ({ id: "u1" }),
      getUser: async () => null,
      getUserByEmail: async () => null,
      getUserByAccount: async () => null,
      updateUser: async (user: { id: string }) => user,
      linkAccount: async (account: unknown) => account,
      createSession: async (session: unknown) => session,
      getSessionAndUser: async () => null,
      updateSession: async () => null,
      deleteSession: async () => {},
    } as any;

    const report = assessAdapterReadiness(minimal, {
      deployment: "production",
      requireEmailProviderSupport: true,
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers.join(" ")).toMatch(/email provider flows require/i);
    expect(report.warnings.join(" ")).toMatch(/missing recommended production method/i);
  });
});
