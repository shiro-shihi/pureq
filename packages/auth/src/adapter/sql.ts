import type {
  AuthAccount,
  AuthPasskeyCredential,
  AuthDatabaseAdapter,
  AuthPasswordCredential,
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
  readonly passwordCredentials: string;
  readonly authenticators: string;
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
  passwordCredentials: "auth_password_credentials",
  authenticators: "auth_authenticators",
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
    passwordCredentials: partial?.passwordCredentials ?? DEFAULT_TABLES.passwordCredentials,
    authenticators: partial?.authenticators ?? DEFAULT_TABLES.authenticators,
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

function rowToPasswordCredential(row: SqlRow): AuthPasswordCredential {
  return {
    userId: String(row.user_id),
    passwordHash: String(row.password_hash),
    salt: String(row.salt),
    algorithm:
      row.algorithm === "argon2id" || row.algorithm === "scrypt" || row.algorithm === "pbkdf2-sha256"
        ? row.algorithm
        : "pbkdf2-sha256",
    iterations: typeof row.iterations === "number" ? row.iterations : null,
    ...(row.created_at == null ? {} : { createdAt: toDate(row.created_at) }),
    ...(row.updated_at == null ? {} : { updatedAt: toDate(row.updated_at) }),
  };
}

function rowToPasskeyCredential(row: SqlRow): AuthPasskeyCredential {
  const transportsRaw = typeof row.transports === "string" ? row.transports : "";
  const transports = transportsRaw
    ? transportsRaw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : [];

  return {
    credentialId: String(row.credential_id),
    userId: String(row.user_id),
    publicKey: String(row.public_key),
    counter: typeof row.counter === "number" ? row.counter : Number(row.counter ?? 0),
    ...(transports.length > 0 ? { transports } : {}),
    ...(typeof row.backed_up === "boolean" ? { backedUp: row.backed_up } : {}),
    ...(row.device_type === "singleDevice" || row.device_type === "multiDevice" ? { deviceType: row.device_type } : {}),
    ...(row.aaguid == null ? {} : { aaguid: String(row.aaguid) }),
    ...(row.created_at == null ? {} : { createdAt: toDate(row.created_at) }),
    ...(row.last_used_at == null ? {} : { lastUsedAt: toDate(row.last_used_at) }),
  };
}

function mapAccountType(value: unknown): AuthAccount["type"] {
  if (value === "oauth" || value === "oidc" || value === "credentials" || value === "email" || value === "webauthn") {
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

function nullSafeEqualsSql(dialect: SqlDialect, column: string, index: number): string {
  const token = placeholder(dialect, index);
  return dialect === "postgres" ? `${column} IS NOT DISTINCT FROM ${token}` : `${column} <=> ${token}`;
}

function normalizeExpiresAt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  return null;
}

function sameAccountSnapshot(a: AuthAccount, b: AuthAccount): boolean {
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

    async getAccount(provider, providerAccountId) {
      const sql = `SELECT user_id, type, provider, provider_account_id, access_token, refresh_token, expires_at, token_type, scope, id_token FROM ${tables.accounts} WHERE provider = ${placeholder(dialect, 1)} AND provider_account_id = ${placeholder(dialect, 2)} LIMIT 1`;
      const rows = await executor.select(sql, [provider, providerAccountId]);
      const row = rows[0];
      if (!row) {
        return null;
      }
      return {
        userId: String(row.user_id),
        type: mapAccountType(row.type),
        provider: String(row.provider),
        providerAccountId: String(row.provider_account_id),
        ...(row.access_token == null ? {} : { accessToken: String(row.access_token) }),
        ...(row.refresh_token == null ? {} : { refreshToken: String(row.refresh_token) }),
        ...(row.expires_at == null ? {} : { expiresAt: Number(row.expires_at) }),
        ...(row.token_type == null ? {} : { tokenType: String(row.token_type) }),
        ...(row.scope == null ? {} : { scope: String(row.scope) }),
        ...(row.id_token == null ? {} : { idToken: String(row.id_token) }),
      };
    },

    async updateAccount(account) {
      const existing = await this.getAccount?.(account.provider, account.providerAccountId);
      if (!existing) {
        return null;
      }
      const sql = `UPDATE ${tables.accounts} SET user_id = ${placeholder(dialect, 1)}, type = ${placeholder(dialect, 2)}, access_token = ${placeholder(dialect, 3)}, refresh_token = ${placeholder(dialect, 4)}, expires_at = ${placeholder(dialect, 5)}, token_type = ${placeholder(dialect, 6)}, scope = ${placeholder(dialect, 7)}, id_token = ${placeholder(dialect, 8)} WHERE provider = ${placeholder(dialect, 9)} AND provider_account_id = ${placeholder(dialect, 10)}`;
      await executor.execute(sql, [
        account.userId,
        account.type,
        account.accessToken ?? null,
        account.refreshToken ?? null,
        account.expiresAt ?? null,
        account.tokenType ?? null,
        account.scope ?? null,
        account.idToken ?? null,
        account.provider,
        account.providerAccountId,
      ]);
      return account;
    },

    async updateAccountIfMatch(params) {
      const sql = `UPDATE ${tables.accounts} SET user_id = ${placeholder(dialect, 1)}, type = ${placeholder(dialect, 2)}, access_token = ${placeholder(dialect, 3)}, refresh_token = ${placeholder(dialect, 4)}, expires_at = ${placeholder(dialect, 5)}, token_type = ${placeholder(dialect, 6)}, scope = ${placeholder(dialect, 7)}, id_token = ${placeholder(dialect, 8)} WHERE provider = ${placeholder(dialect, 9)} AND provider_account_id = ${placeholder(dialect, 10)} AND user_id = ${placeholder(dialect, 11)} AND type = ${placeholder(dialect, 12)} AND ${nullSafeEqualsSql(dialect, "access_token", 13)} AND ${nullSafeEqualsSql(dialect, "refresh_token", 14)} AND ${nullSafeEqualsSql(dialect, "expires_at", 15)} AND ${nullSafeEqualsSql(dialect, "token_type", 16)} AND ${nullSafeEqualsSql(dialect, "scope", 17)} AND ${nullSafeEqualsSql(dialect, "id_token", 18)}`;
      const result = await executor.execute(sql, [
        params.next.userId,
        params.next.type,
        params.next.accessToken ?? null,
        params.next.refreshToken ?? null,
        params.next.expiresAt ?? null,
        params.next.tokenType ?? null,
        params.next.scope ?? null,
        params.next.idToken ?? null,
        params.next.provider,
        params.next.providerAccountId,
        params.expected.userId,
        params.expected.type,
        params.expected.accessToken ?? null,
        params.expected.refreshToken ?? null,
        params.expected.expiresAt ?? null,
        params.expected.tokenType ?? null,
        params.expected.scope ?? null,
        params.expected.idToken ?? null,
      ]);

      if (result.affectedRows > 0) {
        return params.next;
      }

      const latest = await this.getAccount?.(params.next.provider, params.next.providerAccountId);
      if (!latest) {
        return null;
      }
      return sameAccountSnapshot(latest, params.next) ? latest : null;
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
      const values: readonly SqlValue[] = [
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
      ];
      if (dialect === "postgres") {
        const sql = `INSERT INTO ${tables.accounts} (user_id, type, provider, provider_account_id, access_token, refresh_token, expires_at, token_type, scope, id_token) VALUES (${placeholders(dialect, 10)}) ON CONFLICT (provider, provider_account_id) DO UPDATE SET user_id = EXCLUDED.user_id, type = EXCLUDED.type, access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token, expires_at = EXCLUDED.expires_at, token_type = EXCLUDED.token_type, scope = EXCLUDED.scope, id_token = EXCLUDED.id_token`;
        await executor.execute(sql, values);
      } else {
        const sql = `INSERT INTO ${tables.accounts} (user_id, type, provider, provider_account_id, access_token, refresh_token, expires_at, token_type, scope, id_token) VALUES (${placeholders(dialect, 10)}) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), type = VALUES(type), access_token = VALUES(access_token), refresh_token = VALUES(refresh_token), expires_at = VALUES(expires_at), token_type = VALUES(token_type), scope = VALUES(scope), id_token = VALUES(id_token)`;
        await executor.execute(sql, values);
      }
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

    async setPasswordCredential(credential) {
      const nowValue = now();
      const existing = await this.getPasswordCredentialByUserId!(credential.userId);
      if (existing) {
        const updateSql = `UPDATE ${tables.passwordCredentials} SET password_hash = ${placeholder(dialect, 1)}, salt = ${placeholder(dialect, 2)}, algorithm = ${placeholder(dialect, 3)}, iterations = ${placeholder(dialect, 4)}, updated_at = ${placeholder(dialect, 5)} WHERE user_id = ${placeholder(dialect, 6)}`;
        await executor.execute(updateSql, [
          credential.passwordHash,
          credential.salt,
          credential.algorithm,
          credential.iterations ?? null,
          nowValue,
          credential.userId,
        ]);
      } else {
        const insertSql = `INSERT INTO ${tables.passwordCredentials} (user_id, password_hash, salt, algorithm, iterations, created_at, updated_at) VALUES (${placeholders(dialect, 7)})`;
        await executor.execute(insertSql, [
          credential.userId,
          credential.passwordHash,
          credential.salt,
          credential.algorithm,
          credential.iterations ?? null,
          nowValue,
          nowValue,
        ]);
      }

      const stored = await this.getPasswordCredentialByUserId!(credential.userId);
      if (!stored) {
        throw new Error("pureq: failed to persist password credential");
      }
      return stored;
    },

    async getPasswordCredentialByUserId(userId) {
      const sql = `SELECT user_id, password_hash, salt, algorithm, iterations, created_at, updated_at FROM ${tables.passwordCredentials} WHERE user_id = ${placeholder(dialect, 1)} LIMIT 1`;
      const rows = await executor.select(sql, [userId]);
      const row = rows[0];
      return row ? rowToPasswordCredential(row) : null;
    },

    async deletePasswordCredential(userId) {
      const sql = `DELETE FROM ${tables.passwordCredentials} WHERE user_id = ${placeholder(dialect, 1)}`;
      await executor.execute(sql, [userId]);
    },

    async createAuthenticator(credential) {
      const values: readonly SqlValue[] = [
        credential.credentialId,
        credential.userId,
        credential.publicKey,
        credential.counter,
        credential.transports?.join(",") ?? null,
        credential.backedUp ?? null,
        credential.deviceType ?? null,
        credential.aaguid ?? null,
        credential.createdAt ?? now(),
        credential.lastUsedAt ?? null,
      ];

      if (dialect === "postgres") {
        const sql = `INSERT INTO ${tables.authenticators} (credential_id, user_id, public_key, counter, transports, backed_up, device_type, aaguid, created_at, last_used_at) VALUES (${placeholders(dialect, 10)}) ON CONFLICT (credential_id) DO UPDATE SET user_id = EXCLUDED.user_id, public_key = EXCLUDED.public_key, counter = EXCLUDED.counter, transports = EXCLUDED.transports, backed_up = EXCLUDED.backed_up, device_type = EXCLUDED.device_type, aaguid = EXCLUDED.aaguid, last_used_at = EXCLUDED.last_used_at`;
        await executor.execute(sql, values);
      } else {
        const sql = `INSERT INTO ${tables.authenticators} (credential_id, user_id, public_key, counter, transports, backed_up, device_type, aaguid, created_at, last_used_at) VALUES (${placeholders(dialect, 10)}) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), public_key = VALUES(public_key), counter = VALUES(counter), transports = VALUES(transports), backed_up = VALUES(backed_up), device_type = VALUES(device_type), aaguid = VALUES(aaguid), last_used_at = VALUES(last_used_at)`;
        await executor.execute(sql, values);
      }

      const stored = await this.getAuthenticatorByCredentialId?.(credential.credentialId);
      if (!stored) {
        throw new Error("pureq: failed to persist authenticator");
      }
      return stored;
    },

    async getAuthenticatorByCredentialId(credentialId) {
      const sql = `SELECT credential_id, user_id, public_key, counter, transports, backed_up, device_type, aaguid, created_at, last_used_at FROM ${tables.authenticators} WHERE credential_id = ${placeholder(dialect, 1)} LIMIT 1`;
      const rows = await executor.select(sql, [credentialId]);
      const row = rows[0];
      return row ? rowToPasskeyCredential(row) : null;
    },

    async listAuthenticatorsByUserId(userId) {
      const sql = `SELECT credential_id, user_id, public_key, counter, transports, backed_up, device_type, aaguid, created_at, last_used_at FROM ${tables.authenticators} WHERE user_id = ${placeholder(dialect, 1)}`;
      const rows = await executor.select(sql, [userId]);
      return rows.map(rowToPasskeyCredential);
    },

    async updateAuthenticatorCounter(params) {
      const sql = `UPDATE ${tables.authenticators} SET counter = ${placeholder(dialect, 1)}, last_used_at = ${placeholder(dialect, 2)} WHERE credential_id = ${placeholder(dialect, 3)}`;
      await executor.execute(sql, [params.counter, params.lastUsedAt ?? now(), params.credentialId]);
      return this.getAuthenticatorByCredentialId?.(params.credentialId) ?? null;
    },

    async deleteAuthenticator(credentialId) {
      const sql = `DELETE FROM ${tables.authenticators} WHERE credential_id = ${placeholder(dialect, 1)}`;
      await executor.execute(sql, [credentialId]);
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
      `CREATE TABLE IF NOT EXISTS ${tables.passwordCredentials} (user_id TEXT PRIMARY KEY, password_hash TEXT NOT NULL, salt TEXT NOT NULL, algorithm TEXT NOT NULL, iterations INTEGER NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);`,
      `CREATE TABLE IF NOT EXISTS ${tables.authenticators} (credential_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, counter BIGINT NOT NULL DEFAULT 0, transports TEXT NULL, backed_up BOOLEAN NULL, device_type TEXT NULL, aaguid TEXT NULL, created_at TIMESTAMPTZ NOT NULL, last_used_at TIMESTAMPTZ NULL);`,
      `CREATE INDEX IF NOT EXISTS ${tables.accounts}_user_id_idx ON ${tables.accounts} (user_id);`,
      `CREATE INDEX IF NOT EXISTS ${tables.sessions}_user_id_idx ON ${tables.sessions} (user_id);`,
      `CREATE INDEX IF NOT EXISTS ${tables.authenticators}_user_id_idx ON ${tables.authenticators} (user_id);`,
    ];
  }

  return [
    `CREATE TABLE IF NOT EXISTS ${tables.users} (id VARCHAR(191) PRIMARY KEY, email VARCHAR(320) UNIQUE NULL, email_verified DATETIME NULL, name TEXT NULL, image TEXT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${tables.accounts} (user_id VARCHAR(191) NOT NULL, type VARCHAR(32) NOT NULL, provider VARCHAR(191) NOT NULL, provider_account_id VARCHAR(191) NOT NULL, access_token TEXT NULL, refresh_token TEXT NULL, expires_at BIGINT NULL, token_type VARCHAR(64) NULL, scope TEXT NULL, id_token LONGTEXT NULL, PRIMARY KEY (provider, provider_account_id), INDEX ${tables.accounts}_user_id_idx (user_id));`,
    `CREATE TABLE IF NOT EXISTS ${tables.sessions} (session_token VARCHAR(191) PRIMARY KEY, user_id VARCHAR(191) NOT NULL, expires_at DATETIME NOT NULL, INDEX ${tables.sessions}_user_id_idx (user_id));`,
    `CREATE TABLE IF NOT EXISTS ${tables.verificationTokens} (identifier VARCHAR(320) NOT NULL, token VARCHAR(191) NOT NULL, expires_at DATETIME NOT NULL, PRIMARY KEY (identifier, token));`,
    `CREATE TABLE IF NOT EXISTS ${tables.passwordCredentials} (user_id VARCHAR(191) PRIMARY KEY, password_hash TEXT NOT NULL, salt TEXT NOT NULL, algorithm VARCHAR(64) NOT NULL, iterations INT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS ${tables.authenticators} (credential_id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(191) NOT NULL, public_key LONGTEXT NOT NULL, counter BIGINT NOT NULL DEFAULT 0, transports TEXT NULL, backed_up BOOLEAN NULL, device_type VARCHAR(32) NULL, aaguid VARCHAR(191) NULL, created_at DATETIME NOT NULL, last_used_at DATETIME NULL, INDEX ${tables.authenticators}_user_id_idx (user_id));`,
  ];
}

export type { SqlDialect, SqlAdapterOptions, TableNames, SqlExecutor, SqlRow, SqlValue };
