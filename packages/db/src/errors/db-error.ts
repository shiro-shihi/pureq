export type DBErrorCode =
  | "CONNECTION_FAILURE"
  | "QUERY_TIMEOUT"
  | "CONSTRAINT_VIOLATION"
  | "UNIQUE_VIOLATION"
  | "FOREIGN_KEY_VIOLATION"
  | "NOT_NULL_VIOLATION"
  | "PERMISSION_DENIED"
  | "SYNTAX_ERROR"
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
  }
}
