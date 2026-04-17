import type { AuthDatabaseAdapter } from "../shared/index.js";

export interface AdapterCapabilityReport {
  readonly hasCoreUserMethods: boolean;
  readonly hasCoreAccountMethods: boolean;
  readonly hasCoreSessionMethods: boolean;
  readonly hasVerificationTokenMethods: boolean;
  readonly hasPasswordCredentialMethods: boolean;
  readonly hasPasskeyMethods: boolean;
  readonly missingRequired: readonly string[];
  readonly missingRecommended: readonly string[];
  readonly level: "level-a" | "level-b" | "level-c";
}

export interface AdapterReadinessOptions {
  readonly deployment?: "development" | "production";
  readonly requireEmailProviderSupport?: boolean;
  readonly requirePasswordAuthSupport?: boolean;
  readonly requirePasskeySupport?: boolean;
}

export interface AdapterReadinessReport {
  readonly capability: AdapterCapabilityReport;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly status: "ready" | "needs-attention" | "blocked";
}

function hasMethod<T extends object>(target: T, key: keyof AuthDatabaseAdapter): boolean {
  return typeof (target as Record<string, unknown>)[String(key)] === "function";
}

export function probeAdapterCapabilities(adapter: AuthDatabaseAdapter): AdapterCapabilityReport {
  const required: Array<keyof AuthDatabaseAdapter> = [
    "createUser",
    "getUser",
    "getUserByEmail",
    "getUserByAccount",
    "updateUser",
    "linkAccount",
    "createSession",
    "getSessionAndUser",
    "updateSession",
    "deleteSession",
  ];

  const recommended: Array<keyof AuthDatabaseAdapter> = [
    "deleteUser",
    "unlinkAccount",
    "createVerificationToken",
    "useVerificationToken",
    "setPasswordCredential",
    "getPasswordCredentialByUserId",
    "deletePasswordCredential",
    "createAuthenticator",
    "getAuthenticatorByCredentialId",
    "listAuthenticatorsByUserId",
    "updateAuthenticatorCounter",
    "deleteAuthenticator",
  ];

  const missingRequired = required.filter((key) => !hasMethod(adapter, key)).map(String);
  const missingRecommended = recommended.filter((key) => !hasMethod(adapter, key)).map(String);

  const hasCoreUserMethods =
    hasMethod(adapter, "createUser") &&
    hasMethod(adapter, "getUser") &&
    hasMethod(adapter, "getUserByEmail") &&
    hasMethod(adapter, "updateUser");

  const hasCoreAccountMethods = hasMethod(adapter, "getUserByAccount") && hasMethod(adapter, "linkAccount");

  const hasCoreSessionMethods =
    hasMethod(adapter, "createSession") &&
    hasMethod(adapter, "getSessionAndUser") &&
    hasMethod(adapter, "updateSession") &&
    hasMethod(adapter, "deleteSession");

  const hasVerificationTokenMethods = hasMethod(adapter, "createVerificationToken") && hasMethod(adapter, "useVerificationToken");
  const hasPasswordCredentialMethods =
    hasMethod(adapter, "setPasswordCredential") &&
    hasMethod(adapter, "getPasswordCredentialByUserId") &&
    hasMethod(adapter, "deletePasswordCredential");
  const hasPasskeyMethods =
    hasMethod(adapter, "createAuthenticator") &&
    hasMethod(adapter, "getAuthenticatorByCredentialId") &&
    hasMethod(adapter, "listAuthenticatorsByUserId") &&
    hasMethod(adapter, "updateAuthenticatorCounter") &&
    hasMethod(adapter, "deleteAuthenticator");

  const level: AdapterCapabilityReport["level"] =
    missingRequired.length === 0 && missingRecommended.length === 0
      ? "level-a"
      : missingRequired.length === 0
        ? "level-b"
        : "level-c";

  return {
    hasCoreUserMethods,
    hasCoreAccountMethods,
    hasCoreSessionMethods,
    hasVerificationTokenMethods,
    hasPasswordCredentialMethods,
    hasPasskeyMethods,
    missingRequired,
    missingRecommended,
    level,
  };
}

export function assessAdapterReadiness(
  adapter: AuthDatabaseAdapter,
  options: AdapterReadinessOptions = {}
): AdapterReadinessReport {
  const capability = probeAdapterCapabilities(adapter);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const deployment = options.deployment ?? "development";

  for (const missing of capability.missingRequired) {
    blockers.push(`missing required adapter method: ${missing}`);
  }

  if (options.requireEmailProviderSupport && !capability.hasVerificationTokenMethods) {
    blockers.push("email provider flows require createVerificationToken/useVerificationToken support");
  }

  if (options.requirePasswordAuthSupport && !capability.hasPasswordCredentialMethods) {
    blockers.push("password auth flows require setPasswordCredential/getPasswordCredentialByUserId/deletePasswordCredential support");
  }

  if (options.requirePasskeySupport && !capability.hasPasskeyMethods) {
    blockers.push("passkey flows require createAuthenticator/getAuthenticatorByCredentialId/listAuthenticatorsByUserId/updateAuthenticatorCounter/deleteAuthenticator support");
  }

  if (deployment === "production") {
    if (capability.level === "level-c") {
      blockers.push("level-c adapters are not production-ready");
    }
    for (const missing of capability.missingRecommended) {
      warnings.push(`missing recommended production method: ${missing}`);
    }
  }

  const status: AdapterReadinessReport["status"] = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "needs-attention" : "ready";

  return {
    capability,
    blockers,
    warnings,
    status,
  };
}
