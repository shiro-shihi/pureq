export type DBErrorCode =
  | "CONNECTION_FAILURE"
  | "QUERY_TIMEOUT"
  | "CONSTRAINT_VIOLATION"
  | "UNIQUE_VIOLATION"
  | "FOREIGN_KEY_VIOLATION"
  | "NOT_NULL_VIOLATION"
  | "PERMISSION_DENIED"
  | "SYNTAX_ERROR"
  | "TRANSACTION_ROLLBACK"
  | "UNKNOWN_ERROR";

export class DBError extends Error {
  constructor(
    public readonly code: DBErrorCode,
    message: string,
    public readonly cause?: unknown,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "DBError";
    Object.setPrototypeOf(this, DBError.prototype);
  }
}

export class UniqueViolationError extends DBError {
  constructor(message: string, cause?: unknown) {
    super("UNIQUE_VIOLATION", message, cause, false);
    this.name = "UniqueViolationError";
  }
}

export class ForeignKeyViolationError extends DBError {
  constructor(message: string, cause?: unknown) {
    super("FOREIGN_KEY_VIOLATION", message, cause, false);
    this.name = "ForeignKeyViolationError";
  }
}

export class ConnectionError extends DBError {
  constructor(message: string, cause?: unknown) {
    super("CONNECTION_FAILURE", message, cause, true);
    this.name = "ConnectionError";
  }
}

export class QueryTimeoutError extends DBError {
  constructor(message: string, cause?: unknown) {
    super("QUERY_TIMEOUT", message, cause, true);
    this.name = "QueryTimeoutError";
  }
}
