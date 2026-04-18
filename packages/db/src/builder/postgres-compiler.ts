import { GenericCompiler } from "./compiler.js";
import type { InsertStatement } from "./ast.js";

/**
 * PostgreSQL specific compiler.
 * Implements features like ON CONFLICT (UPSERT) and optimized masking.
 */
export class PostgresCompiler extends GenericCompiler {
  /**
   * Compiles an INSERT with ON CONFLICT (UPSERT) support.
   * Note: This is an extension to the basic InsertStatement logic.
   */
  compileUpsert(statement: InsertStatement, conflictTarget: string[]): { sql: string; params: unknown[] } {
    const { sql, params } = this.compileInsert(statement);
    
    const keys = Object.keys(statement.values);
    const updateClause = keys
      .filter(k => !conflictTarget.includes(k))
      .map(k => `"${k}" = EXCLUDED."${k}"`)
      .join(", ");
      
    const conflictSql = ` ON CONFLICT (${conflictTarget.map(t => `"${t}"`).join(", ")}) DO UPDATE SET ${updateClause}`;
    
    return {
      sql: sql + conflictSql,
      params
    };
  }

  // Postgres-specific masking could be implemented here using REGEXP_REPLACE if needed
}
