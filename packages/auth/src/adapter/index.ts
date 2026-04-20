import { generateSecureId } from "@pureq/pureq";
import type {
  AuthDatabaseAdapter,
  AuthPersistedSession,
  AuthUser,
  AuthVerificationToken,
} from "../shared/index.js";

export * from "./pureq.js";
export * from "./sql.js";
export * from "./capabilities.js";

/**
 * Creates a simple in-memory database adapter for testing and development.
 * SEC-SAFE: Uses generateSecureId() for IDs instead of Math.random().
 */
export function createInMemoryAdapter(): AuthDatabaseAdapter {
  const users = new Map<string, AuthUser>();
  const accounts = new Map<string, any>();
  const sessions = new Map<string, AuthPersistedSession>();
  const verificationTokens = new Map<string, AuthVerificationToken>();

  return {
    async createUser(user) {
      const id = (user as any).id ?? `u_${generateSecureId(16)}`;
      const newUser = { ...user, id } as AuthUser;
      users.set(id, newUser);
      return newUser;
    },

    async getUser(id) {
      return users.get(id) ?? null;
    },

    async getUserByEmail(email) {
      return [...users.values()].find((u) => u.email === email) ?? null;
    },

    async getUserByAccount(provider, providerAccountId) {
      const account = accounts.get(`${provider}:${providerAccountId}`);
      if (!account) return null;
      return users.get(account.userId) ?? null;
    },

    async updateUser(user) {
      const existing = users.get(user.id);
      if (!existing) throw new Error("pureq: user not found");
      const updated = { ...existing, ...user };
      users.set(user.id, updated);
      return updated;
    },

    async deleteUser(id) {
      users.delete(id);
    },

    async linkAccount(account) {
      accounts.set(`${account.provider}:${account.providerAccountId}`, account);
      return account;
    },

    async unlinkAccount(provider, providerAccountId) {
      accounts.delete(`${provider}:${providerAccountId}`);
    },

    async createSession(session) {
      sessions.set(session.sessionToken, session);
      return session;
    },

    async getSessionAndUser(sessionToken) {
      const session = sessions.get(sessionToken);
      if (!session) return null;
      if (session.expiresAt < new Date()) {
        sessions.delete(sessionToken);
        return null;
      }
      const user = users.get(session.userId);
      if (!user) return null;
      return { session, user };
    },

    async updateSession(session) {
      const existing = sessions.get(session.sessionToken);
      if (!existing) return null;
      const updated = { ...existing, ...session };
      sessions.set(session.sessionToken, updated);
      return updated;
    },

    async deleteSession(sessionToken) {
      sessions.delete(sessionToken);
    },

    async createVerificationToken(token) {
      verificationTokens.set(`${token.identifier}:${token.token}`, token);
      return token;
    },

    async useVerificationToken(params) {
      const key = `${params.identifier}:${params.token}`;
      const token = verificationTokens.get(key);
      if (!token) return null;
      verificationTokens.delete(key);
      return token.expiresAt < new Date() ? null : token;
    },
  };
}
