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
  });
});
