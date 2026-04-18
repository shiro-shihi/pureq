import type {
  AuthAccount,
  AuthDatabaseAdapter,
  AuthPersistedSession,
  AuthUser,
  AuthVerificationToken,
} from "../shared/index.js";

type SqlValue = string | number | boolean | Date | null;
type SqlRow = Readonly<Record<string, unknown>>;

type SqlDialect = "postgres" | "mysql";

interface TableNames {
  readonly users: string;
  readonly accounts: string;
  readonly sessions: string;
  readonly verificationTokens: string;
}

interface SqlExecutor {
  readonly select: (sql: string, params: readonly SqlValue[]) => Promise<readonly SqlRow[]>;
  readonly execute: (sql: string, params: readonly SqlValue[]) => Promise<{ readonly affectedRows: number }>;
}

interface SqlAdapterOptions {
  readonly tableNames?: Partial<TableNames>;
}

export interface PostgresClientLike {
  query(sql: string, params?: readonly SqlValue[]): Promise<{ readonly rows?: readonly SqlRow[]; readonly rowCount?: number | null }>;
}

export interface MySqlClientLike {
  execute(sql: string, params?: readonly SqlValue[]): Promise<readonly [unknown, unknown?]>;
}

const DEFAULT_TABLES: TableNames = {
  users: "auth_users",
  accounts: "auth_accounts",
  sessions: "auth_sessions",
  verificationTokens: "auth_verification_tokens",
};

function isSafeIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

function resolveTableNames(partial?: Partial<TableNames>): TableNames {
  const merged: TableNames = {
    users: partial?.users ?? DEFAULT_TABLES.users,
    accounts: partial?.accounts ?? DEFAULT_TABLES.accounts,
    sessions: partial?.sessions ?? DEFAULT_TABLES.sessions,
    verificationTokens: partial?.verificationTokens ?? DEFAULT_TABLES.verificationTokens,
  };

  for (const name of Object.values(merged)) {
    if (!isSafeIdentifier(name)) {
      throw new Error(`pureq: invalid table name: ${name}`);
    }
  }

  return merged;
}

function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  return new Date(0);
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function now(): Date {
  return new Date();
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `user_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function rowToUser(row: SqlRow): AuthUser {
  return {
    id: String(row.id),
    email: normalizeNullableString(row.email),
    emailVerified: row.email_verified == null ? null : toDate(row.email_verified),
    name: normalizeNullableString(row.name),
    image: normalizeNullableString(row.image),
  };
}

function rowToSession(row: SqlRow): AuthPersistedSession {
  return {
    sessionToken: String(row.session_token),
    userId: String(row.user_id),
    expiresAt: toDate(row.expires_at),
  };
}

function mapAccountType(value: unknown): AuthAccount["type"] {
  if (value === "oauth" || value === "oidc" || value === "credentials" || value === "email") {
    return value;
  }
  return "oidc";
}

function placeholder(dialect: SqlDialect, index: number): string {
  return dialect === "postgres" ? `$${index}` : "?";
}

function placeholders(dialect: SqlDialect, count: number, start = 1): string {
  return Array.from({ length: count }, (_, i) => placeholder(dialect, i + start)).join(", ");
}

export function createPostgresExecutor(client: PostgresClientLike): SqlExecutor {
  return {
    async select(sql, params) {
      const result = await client.query(sql, params);
      return result.rows ?? [];
    },
    async execute(sql, params) {
      const result = await client.query(sql, params);
      return { affectedRows: result.rowCount ?? 0 };
    },
  };
}

function toMySqlRows(result: unknown): readonly SqlRow[] {
  if (!Array.isArray(result)) {
    return [];
  }
  return result as readonly SqlRow[];
}

function toMySqlAffectedRows(result: unknown): number {
  if (!result || typeof result !== "object") {
    return 0;
  }
  if ("affectedRows" in result && typeof (result as { affectedRows?: unknown }).affectedRows === "number") {
    return (result as { affectedRows: number }).affectedRows;
  }
  return 0;
}

export function createMySqlExecutor(client: MySqlClientLike): SqlExecutor {
  return {
    async select(sql, params) {
      const [rows] = await client.execute(sql, params);
      return toMySqlRows(rows);
    },
    async execute(sql, params) {
      const [result] = await client.execute(sql, params);
      return { affectedRows: toMySqlAffectedRows(result) };
    },
  };
}

export function createSqlAdapter(
  dialect: SqlDialect,
  executor: SqlExecutor,
  options: SqlAdapterOptions = {}
): AuthDatabaseAdapter {
  const tables = resolveTableNames(options.tableNames);

  return {
    async createUser(user) {
      const id = createId();
      const insertSql = `INSERT INTO ${tables.users} (id, email, email_verified, name, image) VALUES (${placeholders(dialect, 5)})`;
      await executor.execute(insertSql, [id, user.email ?? null, user.emailVerified ?? null, user.name ?? null, user.image ?? null]);
      return {
        id,
        email: user.email ?? null,
        emailVerified: user.emailVerified ?? null,
        name: user.name ?? null,
        image: user.image ?? null,
      };
    },

    async getUser(id) {
      const sql = `SELECT id, email, email_verified, name, image FROM ${tables.users} WHERE id = ${placeholder(dialect, 1)} LIMIT 1`;
      const rows = await executor.select(sql, [id]);
      return rows[0] ? rowToUser(rows[0]) : null;
    },

    async getUserByEmail(email) {
      const sql = `SELECT id, email, email_verified, name, image FROM ${tables.users} WHERE email = ${placeholder(dialect, 1)} LIMIT 1`;
      const rows = await executor.select(sql, [email]);
      return rows[0] ? rowToUser(rows[0]) : null;
    },

    async getUserByAccount(provider, providerAccountId) {
      const sql = `SELECT u.id, u.email, u.email_verified, u.name, u.image FROM ${tables.accounts} a JOIN ${tables.users} u ON u.id = a.user_id WHERE a.provider = ${placeholder(dialect, 1)} AND a.provider_account_id = ${placeholder(dialect, 2)} LIMIT 1`;
      const rows = await executor.select(sql, [provider, providerAccountId]);
      return rows[0] ? rowToUser(rows[0]) : null;
    },

    async updateUser(user) {
      const existing = await this.getUser(user.id);
      if (!existing) {
        throw new Error(`pureq: user ${user.id} not found`);
      }

      const merged: AuthUser = {
        ...existing,
        ...user,
      };

      const sql = `UPDATE ${tables.users} SET email = ${placeholder(dialect, 1)}, email_verified = ${placeholder(dialect, 2)}, name = ${placeholder(dialect, 3)}, image = ${placeholder(dialect, 4)} WHERE id = ${placeholder(dialect, 5)}`;
      await executor.execute(sql, [merged.email ?? null, merged.emailVerified ?? null, merged.name ?? null, merged.image ?? null, merged.id]);

      return merged;
    },

    async deleteUser(id) {
      await executor.execute(`DELETE FROM ${tables.users} WHERE id = ${placeholder(dialect, 1)}`, [id]);
    },

    async linkAccount(account) {
      const sql = `INSERT INTO ${tables.accounts} (user_id, type, provider, provider_account_id, access_token, refresh_token, expires_at, token_type, scope, id_token) VALUES (${placeholders(dialect, 10)})`;
      await executor.execute(sql, [
        account.userId,
        account.type,
        account.provider,
        account.providerAccountId,
        account.accessToken ?? null,
        account.refreshToken ?? null,
        account.expiresAt ?? null,
        account.tokenType ?? null,
        account.scope ?? null,
        account.idToken ?? null,
      ]);
      return account;
    },

    async unlinkAccount(provider, providerAccountId) {
      const sql = `DELETE FROM ${tables.accounts} WHERE provider = ${placeholder(dialect, 1)} AND provider_account_id = ${placeholder(dialect, 2)}`;
      await executor.execute(sql, [provider, providerAccountId]);
    },

    async createSession(session) {
      const sql = `INSERT INTO ${tables.sessions} (session_token, user_id, expires_at) VALUES (${placeholders(dialect, 3)})`;
      await executor.execute(sql, [session.sessionToken, session.userId, session.expiresAt]);
      return session;
    },

    async getSessionAndUser(sessionToken) {
      const sql = `SELECT s.session_token, s.user_id, s.expires_at, u.id, u.email, u.email_verified, u.name, u.image FROM ${tables.sessions} s JOIN ${tables.users} u ON u.id = s.user_id WHERE s.session_token = ${placeholder(dialect, 1)} LIMIT 1`;
      const rows = await executor.select(sql, [sessionToken]);
      const row = rows[0];
      if (!row) {
        return null;
      }

      const session = rowToSession(row);
      if (session.expiresAt < now()) {
        await executor.execute(`DELETE FROM ${tables.sessions} WHERE session_token = ${placeholder(dialect, 1)}`, [sessionToken]);
        return null;
      }

      return {
        session,
        user: rowToUser(row),
      };
    },

    async updateSession(session) {
      const existing = await executor.select(
        `SELECT session_token, user_id, expires_at FROM ${tables.sessions} WHERE session_token = ${placeholder(dialect, 1)} LIMIT 1`,
        [session.sessionToken]
      );
      if (!existing[0]) {
        return null;
      }
      const current = rowToSession(existing[0]);
      const next: AuthPersistedSession = {
        sessionToken: current.sessionToken,
        userId: session.userId ?? current.userId,
        expiresAt: session.expiresAt ?? current.expiresAt,
      };

      const sql = `UPDATE ${tables.sessions} SET user_id = ${placeholder(dialect, 1)}, expires_at = ${placeholder(dialect, 2)} WHERE session_token = ${placeholder(dialect, 3)}`;
      await executor.execute(sql, [next.userId, next.expiresAt, next.sessionToken]);
      return next;
    },

    async deleteSession(sessionToken) {
      await executor.execute(`DELETE FROM ${tables.sessions} WHERE session_token = ${placeholder(dialect, 1)}`, [sessionToken]);
    },

    async createVerificationToken(token) {
      const sql = `INSERT INTO ${tables.verificationTokens} (identifier, token, expires_at) VALUES (${placeholders(dialect, 3)})`;
      await executor.execute(sql, [token.identifier, token.token, token.expiresAt]);
      return token;
    },

    async useVerificationToken(params) {
      const selectSql = `SELECT identifier, token, expires_at FROM ${tables.verificationTokens} WHERE identifier = ${placeholder(dialect, 1)} AND token = ${placeholder(dialect, 2)} LIMIT 1`;
      const rows = await executor.select(selectSql, [params.identifier, params.token]);
      const row = rows[0];
      if (!row) {
        return null;
      }

      await executor.execute(
        `DELETE FROM ${tables.verificationTokens} WHERE identifier = ${placeholder(dialect, 1)} AND token = ${placeholder(dialect, 2)}`,
        [params.identifier, params.token]
      );

      const token: AuthVerificationToken = {
        identifier: String(row.identifier),
        token: String(row.token),
        expiresAt: toDate(row.expires_at),
      };

      if (token.expiresAt < now()) {
        return null;
      }

      return token;
    },
  };
}

export function createPostgresAdapter(
  client: PostgresClientLike,
  options: SqlAdapterOptions = {}
): AuthDatabaseAdapter {
  return createSqlAdapter("postgres", createPostgresExecutor(client), options);
}

export function createMySqlAdapter(
  client: MySqlClientLike,
  options: SqlAdapterOptions = {}
): AuthDatabaseAdapter {
  return createSqlAdapter("mysql", createMySqlExecutor(client), options);
}

export function getSqlSchemaStatements(dialect: SqlDialect, options: SqlAdapterOptions = {}): readonly string[] {
  const tables = resolveTableNames(options.tableNames);

  if (dialect === "postgres") {
    return [
      `CREATE TABLE IF NOT EXISTS ${tables.users} (id TEXT PRIMARY KEY, email TEXT UNIQUE, email_verified TIMESTAMPTZ NULL, name TEXT NULL, image TEXT NULL);`,
      `CREATE TABLE IF NOT EXISTS ${tables.accounts} (user_id TEXT NOT NULL, type TEXT NOT NULL, provider TEXT NOT NULL, provider_account_id TEXT NOT NULL, access_token TEXT NULL, refresh_token TEXT NULL, expires_at BIGINT NULL, token_type TEXT NULL, scope TEXT NULL, id_token TEXT NULL, PRIMARY KEY (provider, provider_account_id));`,
      `CREATE TABLE IF NOT EXISTS ${tables.sessions} (session_token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL);`,
      `CREATE TABLE IF NOT EXISTS ${tables.verificationTokens} (identifier TEXT NOT NULL, token TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (identifier, token));`,
      `CREATE INDEX IF NOT EXISTS ${tables.accounts}_user_id_idx ON ${tables.accounts} (user_id);`,
      `CREATE INDEX IF NOT EXISTS ${tables.sessions}_user_id_idx ON ${tables.sessions} (user_id);`,
    ];
  }

  return [
    `CREATE TABLE IF NOT EXISTS ${tables.users} (id VARCHAR(191) PRIMARY KEY, email VARCHAR(320) UNIQUE NULL, email_verified DATETIME NULL, name TEXT NULL, image TEXT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${tables.accounts} (user_id VARCHAR(191) NOT NULL, type VARCHAR(32) NOT NULL, provider VARCHAR(191) NOT NULL, provider_account_id VARCHAR(191) NOT NULL, access_token TEXT NULL, refresh_token TEXT NULL, expires_at BIGINT NULL, token_type VARCHAR(64) NULL, scope TEXT NULL, id_token LONGTEXT NULL, PRIMARY KEY (provider, provider_account_id), INDEX ${tables.accounts}_user_id_idx (user_id));`,
    `CREATE TABLE IF NOT EXISTS ${tables.sessions} (session_token VARCHAR(191) PRIMARY KEY, user_id VARCHAR(191) NOT NULL, expires_at DATETIME NOT NULL, INDEX ${tables.sessions}_user_id_idx (user_id));`,
    `CREATE TABLE IF NOT EXISTS ${tables.verificationTokens} (identifier VARCHAR(320) NOT NULL, token VARCHAR(191) NOT NULL, expires_at DATETIME NOT NULL, PRIMARY KEY (identifier, token));`,
  ];
}

export type { SqlDialect, SqlAdapterOptions, TableNames, SqlExecutor, SqlRow, SqlValue };
