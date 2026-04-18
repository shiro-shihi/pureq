import { table, column, DB } from "@pureq/db";
import type {
  AuthDatabaseAdapter,
  AuthUser,
  AuthAccount,
  AuthPersistedSession,
  AuthVerificationToken,
} from "../shared/index.js";

export function createAuthSchemas(tableNames?: {
  users?: string;
  accounts?: string;
  sessions?: string;
  verificationTokens?: string;
}) {
  const users = table(tableNames?.users ?? "auth_users", {
    id: column.string().primary(),
    email: column.string().nullable(),
    email_verified: column.date().nullable(),
    name: column.string().nullable(),
    image: column.string().nullable(),
  });

  const accounts = table(tableNames?.accounts ?? "auth_accounts", {
    user_id: column.string(),
    type: column.string(),
    provider: column.string(),
    provider_account_id: column.string(),
    access_token: column.string().nullable(),
    refresh_token: column.string().nullable(),
    expires_at: column.number().nullable(),
    token_type: column.string().nullable(),
    scope: column.string().nullable(),
    id_token: column.string().nullable(),
  });

  const sessions = table(tableNames?.sessions ?? "auth_sessions", {
    session_token: column.string().primary(),
    user_id: column.string(),
    expires_at: column.date(),
  });

  const verificationTokens = table(tableNames?.verificationTokens ?? "auth_verification_tokens", {
    identifier: column.string(),
    token: column.string(),
    expires_at: column.date(),
  });

  return { users, accounts, sessions, verificationTokens };
}

export function createPureqDbAdapter(db: DB, tableNames?: Parameters<typeof createAuthSchemas>[0]): AuthDatabaseAdapter {
  const { users, accounts, sessions, verificationTokens } = createAuthSchemas(tableNames);

  return {
    async createUser(user) {
      const id = crypto.randomUUID();
      const data = {
        id,
        email: user.email ?? null,
        email_verified: user.emailVerified ?? null,
        name: user.name ?? null,
        image: user.image ?? null,
      };
      await db.insert(users).values(data).execute();
      return {
        ...data,
        emailVerified: data.email_verified,
      } as AuthUser;
    },

    async getUser(id) {
      const rows = await db.select().from(users).where("id", "=", id).limit(1).execute();
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        email: row.email,
        emailVerified: row.email_verified,
        name: row.name,
        image: row.image,
      } as AuthUser;
    },

    async getUserByEmail(email) {
      const rows = await db.select().from(users).where("email", "=", email).limit(1).execute();
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        email: row.email,
        emailVerified: row.email_verified,
        name: row.name,
        image: row.image,
      } as AuthUser;
    },

    async getUserByAccount(provider, providerAccountId) {
        const rows = await db.select()
            .from(users)
            .innerJoin("a", accounts, ({ base, joined }) => ({
                type: "binary",
                left: { type: "column", name: "id", table: users.name },
                operator: "=",
                right: { type: "column", name: "user_id", table: "a" }
            }))
            .where("provider", "=", provider)
            .where("provider_account_id", "=", providerAccountId)
            .execute();
        
        const row = rows[0];
        if (!row) return null;
        return {
          id: row.id,
          email: row.email,
          emailVerified: row.email_verified,
          name: row.name,
          image: row.image,
        } as AuthUser;
    },

    async updateUser(user) {
        await db.update(users)
            .set({
                email: user.email,
                email_verified: user.emailVerified,
                name: user.name,
                image: user.image
            })
            .where("id", "=", user.id)
            .execute();
        return this.getUser(user.id) as Promise<AuthUser>;
    },

    async deleteUser(id) {
        await db.delete(users).where("id", "=", id).execute();
    },

    async linkAccount(account) {
        await db.insert(accounts).values({
            user_id: account.userId,
            type: account.type,
            provider: account.provider,
            provider_account_id: account.providerAccountId,
            access_token: account.accessToken ?? null,
            refresh_token: account.refreshToken ?? null,
            expires_at: account.expiresAt ?? null,
            token_type: account.tokenType ?? null,
            scope: account.scope ?? null,
            id_token: account.idToken ?? null,
        }).execute();
        return account;
    },

    async unlinkAccount(provider, providerAccountId) {
        await db.delete(accounts)
            .where("provider", "=", provider)
            .where("provider_account_id", "=", providerAccountId)
            .execute();
    },

    async createSession(session) {
        await db.insert(sessions).values({
            session_token: session.sessionToken,
            user_id: session.userId,
            expires_at: session.expiresAt
        }).execute();
        return session;
    },

    async getSessionAndUser(sessionToken) {
        const sRows = await db.select().from(sessions).where("session_token", "=", sessionToken).limit(1).execute();
        const sessionRow = sRows[0];
        if (!sessionRow) return null;

        const user = await this.getUser(sessionRow.user_id);
        if (!user) return null;

        return {
            session: {
                sessionToken: sessionRow.session_token,
                userId: sessionRow.user_id,
                expiresAt: sessionRow.expires_at,
            },
            user
        };
    },

    async updateSession(session) {
        await db.update(sessions)
            .set({
                expires_at: session.expiresAt,
                user_id: session.userId
            })
            .where("session_token", "=", session.sessionToken)
            .execute();
        
        const rows = await db.select().from(sessions).where("session_token", "=", session.sessionToken).limit(1).execute();
        if (!rows[0]) return null;
        return {
            sessionToken: rows[0].session_token,
            userId: rows[0].user_id,
            expiresAt: rows[0].expires_at
        };
    },

    async deleteSession(sessionToken) {
        await db.delete(sessions).where("session_token", "=", sessionToken).execute();
    },

    async createVerificationToken(token) {
        await db.insert(verificationTokens).values(token).execute();
        return token;
    },

    async useVerificationToken(params) {
        const rows = await db.select().from(verificationTokens)
            .where("identifier", "=", params.identifier)
            .where("token", "=", params.token)
            .execute();
        
        const token = rows[0];
        if (!token) return null;

        await db.delete(verificationTokens)
          .where("identifier", "=", params.identifier)
          .where("token", "=", params.token)
          .execute();
        return token as AuthVerificationToken;
    },
  };
}
