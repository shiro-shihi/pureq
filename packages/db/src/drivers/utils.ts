import { 
  DBError, 
  UniqueViolationError, 
  ForeignKeyViolationError, 
  ConnectionError, 
  QueryTimeoutError 
} from "../errors/db-error.js";

/**
 * Common utilities for drivers to normalize database-specific errors.
 */
export function normalizePostgresError(e: any): Error {
  if (e instanceof DBError) return e;

  const pgCode = e.code;
  // SEC-H9: Sanitize error messages to prevent schema leaking
  const rawMessage = e.message || "";
  
  switch (pgCode) {
    case "23505":
      return new UniqueViolationError("A record with this unique identifier already exists.", e);
    case "23503":
      return new ForeignKeyViolationError("This operation violates a relationship constraint.", e);
    case "23502":
      return new DBError("NOT_NULL_VIOLATION", "A required field is missing.", e, false);
    case "42P01":
    case "42601":
      return new DBError("SYNTAX_ERROR", "The database query is malformed.", e, false);
    case "57P01":
    case "57P03":
    case "08006":
    case "08001":
    case "08004":
      return new ConnectionError("The database connection was lost or refused.", e);
    case "57014":
      return new QueryTimeoutError("The database query timed out.", e);
    case "40001":
    case "40P01":
      return new DBError("TRANSACTION_ROLLBACK", "The transaction was rolled back due to a conflict.", e, true);
    default:
      return new DBError("UNKNOWN_ERROR", e.message || "An unexpected database error occurred.", e);
  }
}

export function normalizeSqliteError(e: any): Error {
  if (e instanceof DBError) return e;

  const msg = (e.message || "").toLowerCase();
  const rawMessage = e.message || "An unexpected database error occurred.";
  
  if (msg.includes("unique constraint failed")) {
    return new UniqueViolationError("A record with this unique identifier already exists.", e);
  }
  if (msg.includes("foreign key constraint failed")) {
    return new ForeignKeyViolationError("This operation violates a relationship constraint.", e);
  }
  if (msg.includes("not null constraint failed")) {
    return new DBError("NOT_NULL_VIOLATION", "A required field is missing.", e, false);
  }
  if (msg.includes("syntax error")) {
    return new DBError("SYNTAX_ERROR", "The database query is malformed.", e, false);
  }
  if (msg.includes("database is locked") || msg.includes("interrupted")) {
    return new ConnectionError("The database connection was lost or interrupted.", e);
  }

  return new DBError("UNKNOWN_ERROR", rawMessage, e);
}

export function normalizeMysqlError(e: any): Error {
    if (e instanceof DBError) return e;

    const code = e.code || e.errno;
    const rawMessage = e.message || "An unexpected database error occurred.";
    
    switch (code) {
        case 1062:
        case "ER_DUP_ENTRY":
            return new UniqueViolationError("A record with this unique identifier already exists.", e);
        case 1216:
        case 1217:
        case 1451:
        case 1452:
            return new ForeignKeyViolationError("This operation violates a relationship constraint.", e);
        case 1048:
        case "ER_BAD_NULL_ERROR":
            return new DBError("NOT_NULL_VIOLATION", "A required field is missing.", e, false);
        case 1064:
        case "ER_PARSE_ERROR":
            return new DBError("SYNTAX_ERROR", "The database query is malformed.", e, false);
        case 1045:
        case 1049:
        case 1129:
        case "ER_CON_COUNT_ERROR":
            return new ConnectionError("The database connection was lost or refused.", e);
        case 1205:
        case "ER_LOCK_WAIT_TIMEOUT":
            return new QueryTimeoutError("The database query timed out.", e);
        default:
            return new DBError("UNKNOWN_ERROR", rawMessage, e);
    }
}
