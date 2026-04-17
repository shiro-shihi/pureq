import type {
  AuthDatabaseAdapter,
  AuthPasskeyCredential,
  AuthPasswordCredential,
  AuthUser,
  AuthAccount,
  AuthPersistedSession,
  AuthVerificationToken,
} from "../shared/index.js";
export { probeAdapterCapabilities, assessAdapterReadiness } from "./capabilities.js";
export type { AdapterCapabilityReport, AdapterReadinessOptions, AdapterReadinessReport } from "./capabilities.js";
export {
  createMySqlAdapter,
  createMySqlExecutor,
  createPostgresAdapter,
  createPostgresExecutor,
  createSqlAdapter,
  getSqlSchemaStatements,
} from "./sql.js";
export type {
  MySqlClientLike,
  PostgresClientLike,
  SqlAdapterOptions,
  SqlDialect,
  SqlExecutor,
  SqlRow,
  SqlValue,
  TableNames,
} from "./sql.js";

/**
 * In-memory database adapter for testing and development.
 * FEAT-H1: Implements the full AuthDatabaseAdapter interface.
 */
export function createInMemoryAdapter(): AuthDatabaseAdapter {
  const users = new Map<string, AuthUser>();
  const accounts: AuthAccount[] = [];
  const sessions = new Map<string, { session: AuthPersistedSession; userId: string }>();
  const verificationTokens = new Map<string, AuthVerificationToken>();
  const passwordCredentials = new Map<string, AuthPasswordCredential>();
  const authenticators = new Map<string, AuthPasskeyCredential>();
  let userIdCounter = 0;

  const generateId = (): string => {
    userIdCounter += 1;
    return `user-${userIdCounter}-${Math.random().toString(36).slice(2, 8)}`;
  };

  const normalizeExpiresAt = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (value instanceof Date) {
      return Math.floor(value.getTime() / 1000);
    }
    return null;
  };

  const sameAccountSnapshot = (a: AuthAccount, b: AuthAccount): boolean => {
    return (
      a.userId === b.userId &&
      a.type === b.type &&
      a.provider === b.provider &&
      a.providerAccountId === b.providerAccountId &&
      (a.accessToken ?? null) === (b.accessToken ?? null) &&
      (a.refreshToken ?? null) === (b.refreshToken ?? null) &&
      normalizeExpiresAt(a.expiresAt) === normalizeExpiresAt(b.expiresAt) &&
      (a.tokenType ?? null) === (b.tokenType ?? null) &&
      (a.scope ?? null) === (b.scope ?? null) &&
      (a.idToken ?? null) === (b.idToken ?? null)
    );
  };

  return {
    async createUser(user) {
      const id = generateId();
      const newUser: AuthUser = { ...user, id };
      users.set(id, newUser);
      return newUser;
    },

    async getUser(id) {
      return users.get(id) ?? null;
    },

    async getUserByEmail(email) {
      for (const user of users.values()) {
        if (user.email === email) {
          return user;
        }
      }
      return null;
    },

    async getUserByAccount(provider, providerAccountId) {
      const account = accounts.find(
        (a) => a.provider === provider && a.providerAccountId === providerAccountId
      );
      if (!account) {
        return null;
      }
      return users.get(account.userId) ?? null;
    },

    async getAccount(provider, providerAccountId) {
      const account = accounts.find(
        (a) => a.provider === provider && a.providerAccountId === providerAccountId
      );
      return account ?? null;
    },

    async updateAccount(account) {
      const idx = accounts.findIndex(
        (a) => a.provider === account.provider && a.providerAccountId === account.providerAccountId
      );
      if (idx === -1) {
        return null;
      }
      accounts[idx] = {
        ...accounts[idx],
        ...account,
      };
      return accounts[idx];
    },

    async updateAccountIfMatch(params) {
      const idx = accounts.findIndex(
        (a) => a.provider === params.next.provider && a.providerAccountId === params.next.providerAccountId
      );
      if (idx === -1) {
        return null;
      }

      const current = accounts[idx]!;
      if (!sameAccountSnapshot(current, params.expected)) {
        return null;
      }

      accounts[idx] = {
        ...current,
        ...params.next,
      };
      return accounts[idx];
    },

    async updateUser(user) {
      const existing = users.get(user.id);
      if (!existing) {
        throw new Error(`pureq: user ${user.id} not found`);
      }
      const updated = { ...existing, ...user };
      users.set(user.id, updated);
      return updated;
    },

    async deleteUser(id) {
      users.delete(id);
      const toRemove = accounts.filter((a) => a.userId === id);
      for (const acc of toRemove) {
        const idx = accounts.indexOf(acc);
        if (idx !== -1) {
          accounts.splice(idx, 1);
        }
      }
    },

    async linkAccount(account) {
      const existingIndex = accounts.findIndex(
        (a) => a.provider === account.provider && a.providerAccountId === account.providerAccountId
      );
      if (existingIndex === -1) {
        accounts.push(account);
        return account;
      }
      accounts[existingIndex] = {
        ...accounts[existingIndex],
        ...account,
      };
      return accounts[existingIndex];
    },

    async unlinkAccount(provider, providerAccountId) {
      const idx = accounts.findIndex(
        (a) => a.provider === provider && a.providerAccountId === providerAccountId
      );
      if (idx !== -1) {
        accounts.splice(idx, 1);
      }
    },

    async createSession(session) {
      sessions.set(session.sessionToken, { session, userId: session.userId });
      return session;
    },

    async getSessionAndUser(sessionToken) {
      const entry = sessions.get(sessionToken);
      if (!entry) {
        return null;
      }
      if (entry.session.expiresAt < new Date()) {
        sessions.delete(sessionToken);
        return null;
      }
      const user = users.get(entry.userId);
      if (!user) {
        return null;
      }
      return { session: entry.session, user };
    },

    async updateSession(session) {
      const existing = sessions.get(session.sessionToken);
      if (!existing) {
        return null;
      }
      const updated = { ...existing.session, ...session };
      sessions.set(session.sessionToken, { session: updated, userId: existing.userId });
      return updated;
    },

    async deleteSession(sessionToken) {
      sessions.delete(sessionToken);
    },

    async createVerificationToken(token) {
      const key = `${token.identifier}:${token.token}`;
      verificationTokens.set(key, token);
      return token;
    },

    async useVerificationToken(params) {
      const key = `${params.identifier}:${params.token}`;
      const token = verificationTokens.get(key);
      if (!token) {
        return null;
      }
      verificationTokens.delete(key);
      if (token.expiresAt < new Date()) {
        return null;
      }
      return token;
    },

    async setPasswordCredential(credential) {
      const now = new Date();
      const existing = passwordCredentials.get(credential.userId);
      const next: AuthPasswordCredential = {
        ...credential,
        ...(existing?.createdAt ? { createdAt: existing.createdAt } : { createdAt: now }),
        updatedAt: now,
      };
      passwordCredentials.set(credential.userId, next);
      return next;
    },

    async getPasswordCredentialByUserId(userId) {
      return passwordCredentials.get(userId) ?? null;
    },

    async deletePasswordCredential(userId) {
      passwordCredentials.delete(userId);
    },

    async createAuthenticator(credential) {
      authenticators.set(credential.credentialId, credential);
      return credential;
    },

    async getAuthenticatorByCredentialId(credentialId) {
      return authenticators.get(credentialId) ?? null;
    },

    async listAuthenticatorsByUserId(userId) {
      const list: AuthPasskeyCredential[] = [];
      for (const credential of authenticators.values()) {
        if (credential.userId === userId) {
          list.push(credential);
        }
      }
      return list;
    },

    async updateAuthenticatorCounter(params) {
      const current = authenticators.get(params.credentialId);
      if (!current) {
        return null;
      }
      const updated: AuthPasskeyCredential = {
        ...current,
        counter: params.counter,
        ...(params.lastUsedAt ? { lastUsedAt: params.lastUsedAt } : {}),
      };
      authenticators.set(params.credentialId, updated);
      return updated;
    },

    async deleteAuthenticator(credentialId) {
      authenticators.delete(credentialId);
    },
  };
}

export type {
  AuthDatabaseAdapter,
  AuthPasskeyCredential,
  AuthPasswordCredential,
  AuthUser,
  AuthAccount,
  AuthPersistedSession,
  AuthVerificationToken,
} from "../shared/index.js";
