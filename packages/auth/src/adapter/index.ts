import type {
  AuthDatabaseAdapter,
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
export { createPureqDbAdapter, createAuthSchemas } from "./pureq.js";
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
  let userIdCounter = 0;

  const generateId = (): string => {
    userIdCounter += 1;
    return `user-${userIdCounter}-${Math.random().toString(36).slice(2, 8)}`;
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
      accounts.push(account);
      return account;
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
  };
}

export type { AuthDatabaseAdapter, AuthUser, AuthAccount, AuthPersistedSession, AuthVerificationToken } from "../shared/index.js";
