import { IDENTIFIER_REGEX, CONTROL_CHARS_REGEX, validateIdentifier, validateOperator, validateFunctionName } from "./utils.js";
import type {
  SelectStatement,
  InsertStatement,
  UpdateStatement,
  DeleteStatement,
  Expression,
  Join,
} from "./ast.js";

export class GenericCompiler {
  private validateIdentifier(name: string): void {
    validateIdentifier(name);
  }

  private quoteIdentifier(name: string): string {
    this.validateIdentifier(name);
    return `"${name.replace(/"/g, '""')}"`;
  }

  private validateOperator(operator: string): string {
    return validateOperator(operator);
  }

  compileSelect(statement: SelectStatement): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    
    let columnsSql = "*";
    if (Array.isArray(statement.columns)) {
      columnsSql = statement.columns.map((c) => {
        if (typeof c === "string") {
          return this.quoteIdentifier(c);
        } else {
          const compiled = this.compileExpression(c);
          params.push(...compiled.params);
          return compiled.sql;
        }
      }).join(", ");
    } else if (statement.columns !== "*") {
       throw new Error(`Security Exception: Invalid columns format`);
    }

    const table = this.quoteIdentifier(statement.table);
    let sql = `SELECT ${columnsSql} FROM ${table}`;

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

    if (statement.groupBy && statement.groupBy.length > 0) {
      sql += ` GROUP BY ${statement.groupBy.map(g => this.quoteIdentifier(g)).join(", ")}`;
    }

    if (statement.having) {
      const { sql: havingSql, params: havingParams } = this.compileExpression(statement.having);
      sql += ` HAVING ${havingSql}`;
      params.push(...havingParams);
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
    // Quality Improvement: Use iterative approach for flat binary chains (OR/AND) to prevent stack overflow
    if (expr.type === "binary" && (expr.operator === "OR" || expr.operator === "AND")) {
        const parts: string[] = [];
        const params: unknown[] = [];
        const op = expr.operator;
        let current: Expression = expr;
        const stack: Expression[] = [];

        // Flatten left-heavy trees
        while (current.type === "binary" && current.operator === op) {
            stack.push(current.right);
            current = current.left;
        }
        stack.push(current);

        while (stack.length > 0) {
            const node = stack.pop()!;
            const compiled = this.compileExpression(node);
            parts.push(compiled.sql);
            params.push(...compiled.params);
        }

        return {
            sql: `(${parts.join(` ${op} `)})`,
            params
        };
    }

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
        
        if (op === "IN" || op === "NOT IN") {
          if (expr.right.type === "literal" && Array.isArray(expr.right.value)) {
            if (expr.right.value.length === 0) {
              return { sql: op === "IN" ? "(1 = 0)" : "(1 = 1)", params: [] };
            }
            const left = this.compileExpression(expr.left);
            const placeholders = expr.right.value.map(() => "?").join(", ");
            return {
              sql: `(${left.sql} ${op} (${placeholders}))`,
              params: [...left.params, ...expr.right.value],
            };
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
        validateFunctionName(expr.name);
        const args = expr.args.map((a) => this.compileExpression(a));
        return {
          sql: `${expr.name.toUpperCase()}(${args.map((a) => a.sql).join(", ")})`,
          params: args.flatMap((a) => a.params),
        };
      }
      default:
        throw new Error(`Unsupported expression type: ${(expr as any).type}`);
    }
  }
}
