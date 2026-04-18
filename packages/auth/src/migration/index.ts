import type { AuthSessionManager, AuthSessionState, AuthStore, AuthTokens } from "../shared/index.js";

export interface AuthLegacyTokenSnapshot {
  readonly accessToken?: string | null;
  readonly access_token?: string | null;
  readonly token?: string | null;
  readonly refreshToken?: string | null;
  readonly refresh_token?: string | null;
  readonly refresh?: string | null;
  readonly tokens?: AuthLegacyTokenSnapshot | null;
}

export interface AuthMigrationResult {
  readonly tokens: AuthTokens | null;
  readonly source: "legacy-object" | "legacy-string" | "legacy-nested" | "empty";
}

export type AuthMigrationParityStatus = "covered" | "partial" | "missing";

export interface AuthMigrationAnalysisInput {
  readonly legacyInput?: unknown;
  readonly hasProviders?: boolean;
  readonly hasAdapter?: boolean;
  readonly hasCallbacks?: boolean;
  readonly hasSsrBridge?: boolean;
  readonly enableCsrf?: boolean;
  readonly enableRevocation?: boolean;
}

export interface AuthMigrationAnalysis {
  readonly normalized: AuthMigrationResult;
  readonly parity: Readonly<Record<string, AuthMigrationParityStatus>>;
  readonly cutoverChecklist: readonly string[];
  readonly rollbackChecklist: readonly string[];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function readLegacyField(snapshot: Readonly<Record<string, unknown>>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const candidate = snapshot[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return null;
}

export function normalizeLegacyAuthTokens(input: unknown): AuthMigrationResult {
  if (typeof input === "string" && input.trim()) {
    return {
      tokens: {
        accessToken: input,
      },
      source: "legacy-string",
    };
  }

  if (!isRecord(input)) {
    return {
      tokens: null,
      source: "empty",
    };
  }

  const nested = input.tokens;
  if (isRecord(nested)) {
    const nestedResult = normalizeLegacyAuthTokens(nested);
    if (nestedResult.tokens) {
      return {
        tokens: nestedResult.tokens,
        source: "legacy-nested",
      };
    }
  }

  const accessToken = readLegacyField(input, ["accessToken", "access_token", "token"]);
  const refreshToken = readLegacyField(input, ["refreshToken", "refresh_token", "refresh"]);

  if (!accessToken) {
    return {
      tokens: null,
      source: "empty",
    };
  }

  return {
    tokens: {
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
    },
    source: "legacy-object",
  };
}

export async function migrateLegacyTokensToStore(
  store: AuthStore,
  input: unknown
): Promise<AuthMigrationResult> {
  const result = normalizeLegacyAuthTokens(input);

  if (!result.tokens) {
    await store.clear();
    await store.clearRefresh();
    return result;
  }

  await store.set(result.tokens.accessToken);
  if (result.tokens.refreshToken) {
    await store.setRefresh(result.tokens.refreshToken);
  } else {
    await store.clearRefresh();
  }

  return result;
}

export async function hydrateSessionManagerFromLegacy(
  session: AuthSessionManager,
  input: unknown
): Promise<AuthSessionState> {
  const result = normalizeLegacyAuthTokens(input);

  if (!result.tokens) {
    await session.clear();
    return session.getState();
  }

  await session.setTokens(result.tokens);
  return session.getState();
}

export function analyzeAuthMigration(input: AuthMigrationAnalysisInput = {}): AuthMigrationAnalysis {
  const normalized = normalizeLegacyAuthTokens(input.legacyInput ?? null);
  const parity: Record<string, AuthMigrationParityStatus> = {
    providers: input.hasProviders ? "covered" : "missing",
    adapter: input.hasAdapter ? "covered" : "missing",
    callbacks: input.hasCallbacks ? "covered" : "partial",
    ssrBridge: input.hasSsrBridge ? "covered" : "partial",
    csrf: input.enableCsrf ? "covered" : "partial",
    revocation: input.enableRevocation ? "covered" : "partial",
    legacyTokens: normalized.tokens ? "covered" : "partial",
  };

  const cutoverChecklist: string[] = [];
  if (parity.providers !== "covered") {
    cutoverChecklist.push("Configure provider set and callback route mapping");
  }
  if (parity.adapter !== "covered") {
    cutoverChecklist.push("Wire a production adapter and verify capability probe level");
  }
  if (parity.callbacks === "partial") {
    cutoverChecklist.push("Define signIn/session/signOut callback policy contracts");
  }
  if (parity.ssrBridge === "partial") {
    cutoverChecklist.push("Add SSR/BFF bridge bootstrap and response cookie handoff");
  }
  if (parity.csrf === "partial") {
    cutoverChecklist.push("Enable CSRF protection for browser-mutating routes");
  }
  if (parity.revocation === "partial") {
    cutoverChecklist.push("Enable revocation guard and jti/sid invalidation flow");
  }

  const rollbackChecklist: string[] = [
    "Keep legacy token/session parser active behind feature flag",
    "Retain previous auth route handlers for one release window",
    "Gate AuthKit activation with environment toggle",
    "Capture migration parity report in deployment artifact",
  ];

  return {
    normalized,
    parity,
    cutoverChecklist,
    rollbackChecklist,
  };
}

export function formatMigrationParityReport(analysis: AuthMigrationAnalysis): string {
  const lines = [
    "| Area | Status |",
    "| --- | --- |",
    ...Object.entries(analysis.parity).map(([area, status]) => `| ${area} | ${status} |`),
  ];
  return lines.join("\n");
}

export function generateMigrationChecklists(analysis: AuthMigrationAnalysis): {
  readonly cutover: readonly string[];
  readonly rollback: readonly string[];
} {
  return {
    cutover: analysis.cutoverChecklist,
    rollback: analysis.rollbackChecklist,
  };
}