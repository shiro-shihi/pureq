import { parseWithOptions, isOk } from "@pureq/validation";
import type { DB } from "../core/db.js";
import type { Table } from "../schema/dsl.js";
import type { InferSelect, InferInsert } from "../schema/inference.js";
import { toValidationSchema } from "../schema/validation-bridge.js";
import type { SelectStatement, InsertStatement, UpdateStatement, DeleteStatement, Expression, Join } from "./ast.js";
import { GenericCompiler } from "./compiler.js";
import type { QueryContext } from "../types/context.js";
import { validateIdentifier, isCircular, validateOperator, validateExpression } from "./utils.js";
import { type QuerySpan } from "../types/diagnostics.js";
import { op } from "./expressions.js";
import { createLazyRowProxy } from "../drivers/native/postgres/lazy-row.js";
import { DBError, type DBErrorCode } from "../errors/db-error.js";

/**
 * A runtime-generated secret to cryptographically sign AST-generated queries.
 * Used by the Native driver in Zero-Trust mode to prevent raw SQL injection.
 */
export const PUREQ_AST_SIGNATURE = "pureq_ast_" + Math.random().toString(36).substring(2);

export type JoinResult<TBase extends Table<any, any>, TJoined extends Record<string, Table<any, any>>> = 
  InferSelect<TBase> & {
    [K in keyof TJoined]: InferSelect<TJoined[K]>;
  };

function validateString(val: unknown, name: string): string {
    if (typeof val !== "string") {
        throw new Error(`Security Exception: ${name} must be a string, got ${typeof val}`);
    }
    return val;
}

export class SelectBuilder<
  TBase extends Table<any, any> | undefined = undefined,
  TJoined extends Record<string, Table<any, any>> = {}
> {
  private statement: SelectStatement = {
    type: "select",
    table: "",
    columns: "*",
    joins: [],
  };

  private shouldValidate = false;
  private tableObj: TBase = undefined as any;
  private joinedTables: TJoined = {} as any;
  private context?: QueryContext;

  constructor(private readonly db: DB) {}

  from<T extends Table<any, any>>(table: T): SelectBuilder<T, TJoined> {
    this.statement.table = table.name;
    this.tableObj = table as any;
    return this as any;
  }

  select(columns: string[] | "*"): SelectBuilder<TBase, TJoined> {
    if (Array.isArray(columns)) {
        columns.forEach(c => {
          validateString(c, "Column");
          validateIdentifier(c);
        });
    } else if (columns !== "*") {
        validateString(columns, "Columns");
        validateIdentifier(columns);
    }
    this.statement.columns = columns;
    return this;
  }

  innerJoin<T extends Table<any, any>, K extends string>(
    alias: K,
    table: T,
    on: (cols: { base: TBase; joined: T }) => Expression
  ): SelectBuilder<TBase, TJoined & { [P in K]: T }> {
    return this.join("inner", alias, table, on);
  }

  leftJoin<T extends Table<any, any>, K extends string>(
    alias: K,
    table: T,
    on: (cols: { base: TBase; joined: T }) => Expression
  ): SelectBuilder<TBase, TJoined & { [P in K]: T }> {
    return this.join("left", alias, table, on);
  }

  rightJoin<T extends Table<any, any>, K extends string>(
    alias: K,
    table: T,
    on: (cols: { base: TBase; joined: T }) => Expression
  ): SelectBuilder<TBase, TJoined & { [P in K]: T }> {
    return this.join("right", alias, table, on);
  }

  fullJoin<T extends Table<any, any>, K extends string>(
    alias: K,
    table: T,
    on: (cols: { base: TBase; joined: T }) => Expression
  ): SelectBuilder<TBase, TJoined & { [P in K]: T }> {
    return this.join("full", alias, table, on);
  }

  private join<T extends Table<any, any>, K extends string>(
    type: Join["type"],
    alias: K,
    table: T,
    on: (cols: { base: TBase; joined: T }) => Expression
  ): SelectBuilder<TBase, TJoined & { [P in K]: T }> {
    validateString(alias, "Alias");
    validateIdentifier(alias);
    const joinExpr = on({ base: this.tableObj as any, joined: table });
    validateExpression(joinExpr);
    const join: Join = {
      type,
      table: table.name,
      on: joinExpr,
    };
    this.statement.joins!.push(join);
    (this.joinedTables as any)[alias] = table;
    return this as any;
  }

  groupBy(...columns: string[]): SelectBuilder<TBase, TJoined> {
    columns.forEach(c => {
      validateString(c, "Group By Column");
      validateIdentifier(c);
    });
    this.statement.groupBy = columns;
    return this;
  }

  having(expression: Expression): SelectBuilder<TBase, TJoined> {
    validateExpression(expression);
    this.statement.having = expression;
    return this;
  }

  where(column: string | Expression, operator?: string, value?: unknown): SelectBuilder<TBase, TJoined> {
    let expr: Expression;
    if (typeof column !== "string" && column && typeof column === "object" && "type" in (column as any)) {
      validateExpression(column);
      if (operator) {
        validateString(operator, "Operator");
        validateOperator(operator);
        if (isCircular(value)) throw new Error("Security Exception: Circular reference detected");
        expr = {
          type: "binary",
          left: column as Expression,
          operator,
          right: { type: "literal", value }
        };
      } else {
        expr = column as Expression;
      }
    } else {
      validateString(column as string, "Column");
      validateIdentifier(column as string);
      validateString(operator!, "Operator");
      validateOperator(operator!);
      
      if (isCircular(value)) {
        throw new Error("Security Exception: Circular reference detected in literal value");
      }

      expr = {
        type: "binary",
        left: { type: "column", name: column as string },
        operator: operator!,
        right: { type: "literal", value },
      };
    }

    this.addWhere(this.statement, expr);
    return this;
  }

  private addWhere(statement: SelectStatement | UpdateStatement | DeleteStatement, expr: Expression) {
    if (statement.where) {
      statement.where = {
        type: "binary",
        left: statement.where,
        operator: "AND",
        right: expr,
      };
    } else {
      statement.where = expr;
    }
  }

  orderBy(column: string, direction: "ASC" | "DESC" = "ASC"): SelectBuilder<TBase, TJoined> {
    validateString(column, "Column");
    validateIdentifier(column);
    validateString(direction, "Direction");
    if (!this.statement.orderBy) {
      this.statement.orderBy = [];
    }
    this.statement.orderBy.push({ column, direction: direction as any });
    return this;
  }

  limit(limit: number): SelectBuilder<TBase, TJoined> {
    if (typeof limit !== "number" || isNaN(limit)) throw new Error("Security Exception: Limit must be a valid number");
    this.statement.limit = limit;
    return this;
  }

  offset(offset: number): SelectBuilder<TBase, TJoined> {
    if (typeof offset !== "number" || isNaN(offset)) throw new Error("Security Exception: Offset must be a valid number");
    this.statement.offset = offset;
    return this;
  }

  validate(): SelectBuilder<TBase, TJoined> {
    this.shouldValidate = true;
    return this;
  }

  withContext(context: QueryContext): SelectBuilder<TBase, TJoined> {
    this.context = context;
    return this;
  }

  /**
   * Eagerly loads a relation defined in the table schema.
   */
  with<K extends TBase extends Table<any, any> ? keyof (TBase["options"]["relations"] & {}) : never>(
    relationName: K
  ): SelectBuilder<TBase, TJoined & { [P in K & string]: TBase extends Table<any, any> ? (TBase["options"]["relations"] & {})[P]["target"] : never }> {
    if (!this.tableObj) throw new Error(".with() must be called after .from()");
    
    const rel = (this.tableObj.options.relations as any)?.[relationName];
    if (!rel) throw new Error(`Relation "${String(relationName)}" not defined on table "${this.tableObj.name}"`);

    const targetTable = rel.target;
    const foreignKey = rel.foreignKey;
    
    return this.innerJoin(relationName as any, targetTable as any, ({ base, joined }) => ({
      type: "binary",
      left: { type: "column", name: foreignKey, table: (base as any).name },
      operator: "=",
      right: { type: "column", name: "id", table: (joined as any).name }
    })) as any;
  }

  async execute(): Promise<TBase extends Table<any, any> ? (keyof TJoined extends never ? InferSelect<TBase>[] : JoinResult<TBase, TJoined>[]) : unknown[]> {
    if (!this.statement.table) {
      throw new Error("Table must be specified for SELECT query");
    }

    if (this.statement.joins && this.statement.joins.length > 0 && this.statement.columns === "*") {
       const expanded: (string | Expression)[] = [];
       if (this.tableObj) {
         const baseTable = this.tableObj as Table<any, any>;
         Object.keys(baseTable.columns).forEach(col => {
           expanded.push({ type: "column", name: col, table: baseTable.name });
         });
       }
       Object.entries(this.joinedTables as Record<string, Table<any, any>>).forEach(([alias, table]) => {
         Object.keys(table.columns).forEach(col => {
           expanded.push({ type: "column", name: col, table: alias });
         });
       });
       this.statement.columns = expanded;
    }

    const pushdownStatement = this.applyPolicyPushdown();
    const compiler = new GenericCompiler();
    const { sql, params } = compiler.compileSelect(pushdownStatement);
    
    const span: QuerySpan = {
      id: crypto.randomUUID(),
      statement: pushdownStatement,
      sql,
      params,
      startTime: Date.now(),
      duration: 0,
      context: this.context
    };
    
    this.db.diagnostics.onQueryStart(span);
    
    try {
      const result = await this.db.driver.execute<any>({ sql, __pureq_signature: PUREQ_AST_SIGNATURE }, params);
      let rows = result.rows;

      if (this.statement.joins && this.statement.joins.length > 0) {
        rows = rows.map(row => {
          const structured: any = {};
          for (const [key, value] of Object.entries(row)) {
            if (key.startsWith("__") && key.includes("__", 2)) {
               const parts = key.split("__");
               const tableName = parts[1];
               const colName = parts[2];
               if (!tableName || !colName) { structured[key] = value; continue; }
               const alias = Object.keys(this.joinedTables as Record<string, Table<any, any>>).find(a => (this.joinedTables as any)[a].name === tableName) || tableName;
               if (!structured[alias] || typeof structured[alias] !== "object") structured[alias] = {};
               structured[alias][colName] = value;
            } else {
               structured[key] = value;
            }
          }
          return structured;
        });
      }

      if (this.shouldValidate && this.tableObj) {
        const schema = toValidationSchema(this.tableObj);
        const validatedRows = [];
        for (const row of rows) {
          const parsed = parseWithOptions(schema, row);
          if (!isOk(parsed)) throw new Error(`Validation failed for row: ${JSON.stringify(parsed.error)}`);
          validatedRows.push(parsed.value.data as any);
        }
        rows = validatedRows;
      }

      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;
      this.db.diagnostics.onQueryEnd(span);
      return rows as any;
    } catch (error) {
      span.error = error as Error;
      span.endTime = Date.now();
      span.duration = span.endTime - (span.startTime || 0);
      this.db.diagnostics.onQueryEnd(span);
      throw error;
    }
  }

  private applyPolicyPushdown(): SelectStatement {
    if (!this.context) return this.statement;
    const statement = { ...this.statement, joins: this.statement.joins ? [...this.statement.joins] : [] };
    const userScopes = new Set(this.context.scopes ?? []);
    if (this.tableObj) this.applyTablePolicy(statement, this.tableObj as any, undefined, userScopes);
    if (statement.joins) {
        for (const join of statement.joins) {
            const joinedTable = Object.values(this.joinedTables).find(t => t.name === join.table);
            if (joinedTable) this.applyTablePolicy(statement, joinedTable, join.table, userScopes);
        }
    }
    return statement;
  }

  private applyTablePolicy(statement: SelectStatement, table: Table<any, any>, alias: string | undefined, userScopes: Set<string>): void {
    const tableName = alias || table.name;
    if (table.options.policy?.rls && this.context) {
      const genericFilter = table.options.policy.rls(this.context, op);
      this.addWhere(statement, genericFilter);
    } else if (this.context?.userId && table.columns["userId"]) {
       const rowFilter: Expression = {
         type: "binary",
         left: { type: "column", name: "userId", table: tableName },
         operator: "=",
         right: { type: "literal", value: this.context.userId }
       };
       this.addWhere(statement, rowFilter);
    }
    const allowedColumns: (string | Expression)[] = [];
    for (const [name, col] of Object.entries(table.columns)) {
      const options = (col as any).options;
      const policy = options?.policy;
      const hasScope = !policy?.scope || policy.scope.length === 0 || policy.scope.some((s: string) => userScopes.has(s));
      if (!hasScope) { if (policy?.redact === "hide") continue; continue; }
      if (policy?.pii && policy?.redact === "mask") {
        allowedColumns.push({
          type: "binary",
          left: { type: "function", name: "SUBSTR", args: [{ type: "column", name, table: tableName }, { type: "literal", value: 1 }, { type: "literal", value: 3 }] },
          operator: "||",
          right: { type: "literal", value: "***" }
        });
      } else { allowedColumns.push(name); }
    }
    if (statement.columns === "*") { statement.columns = allowedColumns; }
    else if (Array.isArray(statement.columns)) {
        const newRequested: (string | Expression)[] = [];
        for (const req of statement.columns) {
          if (typeof req === "string") {
            const allowed = allowedColumns.find(a => (typeof a === "string" ? a === req : (a as any).left.args[0].name === req));
            if (allowed) newRequested.push(allowed);
          } else { newRequested.push(req); }
        }
        statement.columns = newRequested;
    }
  }
}

export class InsertBuilder<TTable extends Table<any, any>> {
  private statement: InsertStatement;
  constructor(private readonly db: DB, private readonly table: TTable) {
    this.statement = { type: "insert", table: table.name, values: {} };
  }
  values(data: InferInsert<TTable>): InsertBuilder<TTable> {
    this.statement.values = data as Record<string, unknown>;
    return this;
  }
  async execute() {
    const compiler = new GenericCompiler();
    const { sql, params } = compiler.compileInsert(this.statement);
    const span: QuerySpan = { id: crypto.randomUUID(), statement: this.statement, sql, params, startTime: Date.now(), duration: 0 };
    this.db.diagnostics.onQueryStart(span);
    try {
      const result = await this.db.driver.execute({ sql, __pureq_signature: PUREQ_AST_SIGNATURE }, params);
      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;
      this.db.diagnostics.onQueryEnd(span);
      return result;
    } catch (error) {
      span.error = error as Error;
      span.endTime = Date.now();
      this.db.diagnostics.onQueryEnd(span);
      throw error;
    }
  }
}

export class UpdateBuilder<TTable extends Table<any, any>> {
  private statement: UpdateStatement;
  constructor(private readonly db: DB, private readonly table: TTable) {
    this.statement = { type: "update", table: table.name, values: {} };
  }
  set(data: Partial<InferSelect<TTable>>): UpdateBuilder<TTable> {
    this.statement.values = data as Record<string, unknown>;
    return this;
  }
  where(column: string | Expression, operator?: string, value?: unknown): UpdateBuilder<TTable> {
    let newExpr: Expression;
    if (typeof column !== "string" && column && typeof column === "object" && "type" in (column as any)) {
      validateExpression(column);
      newExpr = column as Expression;
    } else {
      validateString(column, "Column");
      validateIdentifier(column as string);
      validateString(operator!, "Operator");
      validateOperator(operator!);
      newExpr = { type: "binary", left: { type: "column", name: column as string }, operator: operator!, right: { type: "literal", value } };
    }
    if (this.statement.where) this.statement.where = { type: "binary", left: this.statement.where, operator: "AND", right: newExpr };
    else this.statement.where = newExpr;
    return this;
  }
  async execute() {
    const compiler = new GenericCompiler();
    const { sql, params } = compiler.compileUpdate(this.statement);
    const span: QuerySpan = { id: crypto.randomUUID(), statement: this.statement, sql, params, startTime: Date.now(), duration: 0 };
    this.db.diagnostics.onQueryStart(span);
    try {
      const result = await this.db.driver.execute({ sql, __pureq_signature: PUREQ_AST_SIGNATURE }, params);
      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;
      this.db.diagnostics.onQueryEnd(span);
      return result;
    } catch (error) {
      span.error = error as Error;
      span.endTime = Date.now();
      this.db.diagnostics.onQueryEnd(span);
      throw error;
    }
  }
}

export class DeleteBuilder<TTable extends Table<any, any>> {
  private statement: DeleteStatement;
  constructor(private readonly db: DB, private readonly table: TTable) {
    this.statement = { type: "delete", table: table.name };
  }
  where(column: string | Expression, operator?: string, value?: unknown): DeleteBuilder<TTable> {
    let newExpr: Expression;
    if (typeof column !== "string" && column && typeof column === "object" && "type" in (column as any)) {
      validateExpression(column);
      newExpr = column as Expression;
    } else {
      validateString(column, "Column");
      validateIdentifier(column as string);
      validateString(operator!, "Operator");
      validateOperator(operator!);
      newExpr = { type: "binary", left: { type: "column", name: column as string }, operator: operator!, right: { type: "literal", value } };
    }
    if (this.statement.where) this.statement.where = { type: "binary", left: this.statement.where, operator: "AND", right: newExpr };
    else this.statement.where = newExpr;
    return this;
  }
  async execute() {
    const compiler = new GenericCompiler();
    const { sql, params } = compiler.compileDelete(this.statement);
    const span: QuerySpan = { id: crypto.randomUUID(), statement: this.statement, sql, params, startTime: Date.now(), duration: 0 };
    this.db.diagnostics.onQueryStart(span);
    try {
      const result = await this.db.driver.execute({ sql, __pureq_signature: PUREQ_AST_SIGNATURE }, params);
      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;
      this.db.diagnostics.onQueryEnd(span);
      return result;
    } catch (error) {
      span.error = error as Error;
      span.endTime = Date.now();
      this.db.diagnostics.onQueryEnd(span);
      throw error;
    }
  }
}

export function count(column: string | "*"): Expression {
  return { type: "function", name: "COUNT", args: [typeof column === "string" ? { type: "column", name: column } : { type: "literal", value: "*" }] };
}
export function sum(column: string): Expression { return { type: "function", name: "SUM", args: [{ type: "column", name: column }] }; }
export function avg(column: string): Expression { return { type: "function", name: "AVG", args: [{ type: "column", name: column }] }; }
export function min(column: string): Expression { return { type: "function", name: "MIN", args: [{ type: "column", name: column }] }; }
export function max(column: string): Expression { return { type: "function", name: "MAX", args: [{ type: "column", name: column }] }; }
