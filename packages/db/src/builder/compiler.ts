import type {
  SelectStatement,
  InsertStatement,
  UpdateStatement,
  DeleteStatement,
  Expression,
  Join,
} from "./ast.js";

const ALLOWED_OPERATORS = new Set([
  "=", "!=", "<", "<=", ">", ">=", "LIKE", "ILIKE", "IN", "NOT IN", "IS", "IS NOT", "AND", "OR"
]);

const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const CONTROL_CHARS_REGEX = /[\0\n\r\t\x08\x1a]/;

export class GenericCompiler {
  private validateIdentifier(name: string): void {
    if (CONTROL_CHARS_REGEX.test(name)) {
      throw new Error(`Security Exception: Control characters detected in identifier`);
    }
    // Strict regex check also effectively blocks NFKC-normalized dangerous chars (like full-width space)
    if (!IDENTIFIER_REGEX.test(name)) {
      throw new Error(`Security Exception: Invalid identifier "${name}". Only alphanumeric and underscores are allowed.`);
    }
  }

  private quoteIdentifier(name: string): string {
    this.validateIdentifier(name);
    return `"${name.replace(/"/g, '""')}"`;
  }

  private validateOperator(operator: string): string {
    const upperOp = operator.toUpperCase();
    if (!ALLOWED_OPERATORS.has(upperOp)) {
      throw new Error(`Security Exception: Disallowed SQL operator "${operator}"`);
    }
    return upperOp;
  }

  compileSelect(statement: SelectStatement): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    
    let columns = "*";
    if (Array.isArray(statement.columns)) {
      columns = statement.columns.map((c) => this.quoteIdentifier(c)).join(", ");
    } else if (statement.columns !== "*") {
       throw new Error(`Security Exception: Invalid columns format`);
    }

    const table = this.quoteIdentifier(statement.table);
    let sql = `SELECT ${columns} FROM ${table}`;

    if (statement.joins && statement.joins.length > 0) {
      for (const join of statement.joins) {
        const { sql: joinSql, params: joinParams } = this.compileJoin(join);
        sql += ` ${joinSql}`;
        params.push(...joinParams);
      }
    }

    if (statement.where) {
      const { sql: whereSql, params: whereParams } = this.compileExpression(
        statement.where,
      );
      sql += ` WHERE ${whereSql}`;
      params.push(...whereParams);
    }

    if (statement.orderBy && statement.orderBy.length > 0) {
      const orders = statement.orderBy
        .map((o) => {
          const dir = o.direction.toUpperCase() === "DESC" ? "DESC" : "ASC";
          return `${this.quoteIdentifier(o.column)} ${dir}`;
        })
        .join(", ");
      sql += ` ORDER BY ${orders}`;
    }

    if (statement.limit !== undefined) {
      sql += ` LIMIT ${Number(statement.limit)}`;
    }

    if (statement.offset !== undefined) {
      sql += ` OFFSET ${Number(statement.offset)}`;
    }

    return { sql, params };
  }

  private compileJoin(join: Join): { sql: string; params: unknown[] } {
    const { sql: onSql, params } = this.compileExpression(join.on);
    const validTypes = ["INNER", "LEFT", "RIGHT", "FULL"];
    const type = join.type.toUpperCase();
    if (!validTypes.includes(type)) {
      throw new Error(`Security Exception: Disallowed join type "${join.type}"`);
    }
    return {
      sql: `${type} JOIN ${this.quoteIdentifier(join.table)} ON ${onSql}`,
      params,
    };
  }

  compileInsert(statement: InsertStatement): { sql: string; params: unknown[] } {
    const keys = Object.keys(statement.values);
    const values = Object.values(statement.values);
    const placeholders = keys.map(() => "?").join(", ");
    const quotedKeys = keys.map((k) => this.quoteIdentifier(k)).join(", ");

    const sql = `INSERT INTO ${this.quoteIdentifier(statement.table)} (${quotedKeys}) VALUES (${placeholders})`;

    return { sql, params: values };
  }

  compileUpdate(statement: UpdateStatement): { sql: string; params: unknown[] } {
    const keys = Object.keys(statement.values);
    const values = Object.values(statement.values);
    const setClause = keys.map((key) => `${this.quoteIdentifier(key)} = ?`).join(", ");

    let sql = `UPDATE ${this.quoteIdentifier(statement.table)} SET ${setClause}`;
    const params = [...values];

    if (statement.where) {
      const { sql: whereSql, params: whereParams } = this.compileExpression(
        statement.where,
      );
      sql += ` WHERE ${whereSql}`;
      params.push(...whereParams);
    }

    return { sql, params };
  }

  compileDelete(statement: DeleteStatement): { sql: string; params: unknown[] } {
    let sql = `DELETE FROM ${this.quoteIdentifier(statement.table)}`;
    const params: unknown[] = [];

    if (statement.where) {
      const { sql: whereSql, params: whereParams = [] } = this.compileExpression(
        statement.where,
      );
      sql += ` WHERE ${whereSql}`;
      params.push(...whereParams);
    }

    return { sql, params };
  }

  private compileExpression(expr: Expression): { sql: string; params: unknown[] } {
    switch (expr.type) {
      case "column": {
        const col = this.quoteIdentifier(expr.name);
        return { 
          sql: expr.table ? `${this.quoteIdentifier(expr.table)}.${col}` : col, 
          params: [] 
        };
      }
      case "literal":
        return { sql: "?", params: [expr.value] };
      case "binary": {
        const op = this.validateOperator(expr.operator);
        
        // Quality Improvement: Handle empty IN clauses safely (e.g. id IN () -> 1 = 0)
        if (op === "IN" || op === "NOT IN") {
          if (expr.right.type === "literal" && Array.isArray(expr.right.value) && expr.right.value.length === 0) {
            return { sql: op === "IN" ? "(1 = 0)" : "(1 = 1)", params: [] };
          }
        }

        const left = this.compileExpression(expr.left);
        const right = this.compileExpression(expr.right);
        return {
          sql: `(${left.sql} ${op} ${right.sql})`,
          params: [...left.params, ...right.params],
        };
      }
      case "function": {
        const functionNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
        if (!functionNameRegex.test(expr.name)) {
          throw new Error(`Security Exception: Disallowed function name "${expr.name}"`);
        }
        const args = expr.args.map((a) => this.compileExpression(a));
        return {
          sql: `${expr.name}(${args.map((a) => a.sql).join(", ")})`,
          params: args.flatMap((a) => a.params),
        };
      }
      default:
        throw new Error(`Unsupported expression type: ${(expr as any).type}`);
    }
  }
}
