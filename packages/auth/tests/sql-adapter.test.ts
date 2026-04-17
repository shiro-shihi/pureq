import { describe, expect, it, vi } from "vitest";
import {
  createMySqlAdapter,
  createMySqlExecutor,
  createPostgresAdapter,
  createPostgresExecutor,
  getSqlSchemaStatements,
} from "../src/adapter";

describe("sql adapter helpers", () => {
  it("maps postgres client responses to executor contract", async () => {
    const query = vi.fn(async () => ({ rows: [{ id: "u1" }], rowCount: 2 }));
    const executor = createPostgresExecutor({ query });

    const rows = await executor.select("SELECT 1", []);
    expect(rows).toEqual([{ id: "u1" }]);

    const result = await executor.execute("UPDATE t SET a = 1", []);
    expect(result.affectedRows).toBe(2);
  });

  it("maps mysql client responses to executor contract", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[{ id: "u1" }], undefined])
      .mockResolvedValueOnce([{ affectedRows: 3 }, undefined]);

    const executor = createMySqlExecutor({ execute });

    const rows = await executor.select("SELECT 1", []);
    expect(rows).toEqual([{ id: "u1" }]);

    const result = await executor.execute("DELETE FROM t", []);
    expect(result.affectedRows).toBe(3);
  });

  it("supports basic user read/write with postgres adapter", async () => {
    const users = new Map<string, { id: string; email: string | null; email_verified: Date | null; name: string | null; image: string | null }>();

    const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      if (sql.startsWith("INSERT INTO auth_users")) {
        const [id, email, emailVerified, name, image] = params as [string, string | null, Date | null, string | null, string | null];
        users.set(id, {
          id,
          email,
          email_verified: emailVerified,
          name,
          image,
        });
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes("FROM auth_users") && sql.includes("WHERE email =")) {
        const email = params[0] as string;
        const found = Array.from(users.values()).find((u) => u.email === email);
        return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
      }

      if (sql.includes("FROM auth_users") && sql.includes("WHERE id =")) {
        const id = params[0] as string;
        const found = users.get(id);
        return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
      }

      if (sql.startsWith("UPDATE auth_users")) {
        const [email, emailVerified, name, image, id] = params as [string | null, Date | null, string | null, string | null, string];
        const existing = users.get(id);
        if (existing) {
          users.set(id, { id, email, email_verified: emailVerified, name, image });
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      return { rows: [], rowCount: 0 };
    });

    const adapter = createPostgresAdapter({ query });

    const created = await adapter.createUser({ email: "alice@example.com", name: "Alice" });
    expect(created.id).toBeTruthy();

    const byEmail = await adapter.getUserByEmail("alice@example.com");
    expect(byEmail?.id).toBe(created.id);

    const updated = await adapter.updateUser({ id: created.id, name: "Alice Updated" });
    expect(updated.name).toBe("Alice Updated");
  });

  it("provides mysql adapter and schema statements", async () => {
    const execute = vi.fn(async () => [{ affectedRows: 1 }, undefined]);
    const adapter = createMySqlAdapter({ execute });

    const created = await adapter.createVerificationToken!({
      identifier: "magic@example.com",
      token: "tok-1",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(created?.identifier).toBe("magic@example.com");

    const postgresSchema = getSqlSchemaStatements("postgres");
    const mysqlSchema = getSqlSchemaStatements("mysql");

    expect(postgresSchema.length).toBeGreaterThan(3);
    expect(mysqlSchema.length).toBeGreaterThan(3);
    expect(postgresSchema.join("\n")).toContain("auth_users");
    expect(mysqlSchema.join("\n")).toContain("auth_users");
    expect(postgresSchema.join("\n")).toContain("auth_password_credentials");
    expect(mysqlSchema.join("\n")).toContain("auth_password_credentials");
    expect(postgresSchema.join("\n")).toContain("auth_authenticators");
    expect(mysqlSchema.join("\n")).toContain("auth_authenticators");
  });

  it("supports password credential upsert/get/delete in postgres adapter", async () => {
    const passwordRows = new Map<
      string,
      {
        user_id: string;
        password_hash: string;
        salt: string;
        algorithm: string;
        iterations: number | null;
        created_at: Date;
        updated_at: Date;
      }
    >();

    const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      if (sql.startsWith("SELECT user_id, password_hash, salt, algorithm, iterations, created_at, updated_at FROM auth_password_credentials")) {
        const userId = params[0] as string;
        const found = passwordRows.get(userId);
        return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
      }

      if (sql.startsWith("INSERT INTO auth_password_credentials")) {
        const [userId, passwordHash, salt, algorithm, iterations, createdAt, updatedAt] = params as [
          string,
          string,
          string,
          string,
          number | null,
          Date,
          Date,
        ];
        passwordRows.set(userId, {
          user_id: userId,
          password_hash: passwordHash,
          salt,
          algorithm,
          iterations,
          created_at: createdAt,
          updated_at: updatedAt,
        });
        return { rows: [], rowCount: 1 };
      }

      if (sql.startsWith("UPDATE auth_password_credentials")) {
        const [passwordHash, salt, algorithm, iterations, updatedAt, userId] = params as [
          string,
          string,
          string,
          number | null,
          Date,
          string,
        ];
        const current = passwordRows.get(userId);
        if (!current) {
          return { rows: [], rowCount: 0 };
        }
        passwordRows.set(userId, {
          ...current,
          password_hash: passwordHash,
          salt,
          algorithm,
          iterations,
          updated_at: updatedAt,
        });
        return { rows: [], rowCount: 1 };
      }

      if (sql.startsWith("DELETE FROM auth_password_credentials")) {
        const userId = params[0] as string;
        passwordRows.delete(userId);
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    });

    const adapter = createPostgresAdapter({ query });

    const first = await adapter.setPasswordCredential!({
      userId: "u1",
      passwordHash: "hash-v1",
      salt: "salt-v1",
      algorithm: "pbkdf2-sha256",
      iterations: 210000,
    });
    expect(first.passwordHash).toBe("hash-v1");

    const second = await adapter.setPasswordCredential!({
      userId: "u1",
      passwordHash: "hash-v2",
      salt: "salt-v2",
      algorithm: "pbkdf2-sha256",
      iterations: 220000,
    });
    expect(second.passwordHash).toBe("hash-v2");

    const loaded = await adapter.getPasswordCredentialByUserId!("u1");
    expect(loaded?.salt).toBe("salt-v2");

    await adapter.deletePasswordCredential!("u1");
    const deleted = await adapter.getPasswordCredentialByUserId!("u1");
    expect(deleted).toBeNull();
  });

  it("supports account upsert and update through postgres adapter", async () => {
    const accountRows = new Map<
      string,
      {
        user_id: string;
        type: string;
        provider: string;
        provider_account_id: string;
        access_token: string | null;
        refresh_token: string | null;
        expires_at: number | null;
        token_type: string | null;
        scope: string | null;
        id_token: string | null;
      }
    >();

    const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      if (sql.startsWith("INSERT INTO auth_accounts")) {
        const [userId, type, provider, providerAccountId, accessToken, refreshToken, expiresAt, tokenType, scope, idToken] = params as [
          string,
          string,
          string,
          string,
          string | null,
          string | null,
          number | null,
          string | null,
          string | null,
          string | null,
        ];
        accountRows.set(`${provider}:${providerAccountId}`, {
          user_id: userId,
          type,
          provider,
          provider_account_id: providerAccountId,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          token_type: tokenType,
          scope,
          id_token: idToken,
        });
        return { rows: [], rowCount: 1 };
      }

      if (sql.startsWith("SELECT user_id, type, provider, provider_account_id")) {
        const [provider, providerAccountId] = params as [string, string];
        const row = accountRows.get(`${provider}:${providerAccountId}`);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      if (sql.startsWith("UPDATE auth_accounts")) {
        const [userId, type, accessToken, refreshToken, expiresAt, tokenType, scope, idToken, provider, providerAccountId] = params as [
          string,
          string,
          string | null,
          string | null,
          number | null,
          string | null,
          string | null,
          string | null,
          string,
          string,
        ];
        accountRows.set(`${provider}:${providerAccountId}`, {
          user_id: userId,
          type,
          provider,
          provider_account_id: providerAccountId,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          token_type: tokenType,
          scope,
          id_token: idToken,
        });
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    });

    const adapter = createPostgresAdapter({ query });

    await adapter.linkAccount({
      userId: "u1",
      type: "oauth",
      provider: "google",
      providerAccountId: "google-user-1",
      accessToken: "access-v1",
      refreshToken: "refresh-v1",
      expiresAt: 100,
    });

    const loaded = await adapter.getAccount!("google", "google-user-1");
    expect(loaded?.accessToken).toBe("access-v1");

    await adapter.updateAccount!({
      userId: "u1",
      type: "oauth",
      provider: "google",
      providerAccountId: "google-user-1",
      accessToken: "access-v2",
      refreshToken: "refresh-v2",
      expiresAt: 200,
    });

    const updated = await adapter.getAccount!("google", "google-user-1");
    expect(updated?.accessToken).toBe("access-v2");
    expect(updated?.refreshToken).toBe("refresh-v2");
  });
});
