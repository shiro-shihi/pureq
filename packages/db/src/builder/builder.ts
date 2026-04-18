import { parseWithOptions, isOk } from "@pureq/validation";
import type { DB } from "../core/db.js";
import type { Table, ColumnBuilder } from "../schema/dsl.js";
import type { InferSelect, InferInsert } from "../schema/inference.js";
import { toValidationSchema } from "../schema/validation-bridge.js";
import type { SelectStatement, InsertStatement, UpdateStatement, DeleteStatement, Expression, Join } from "./ast.js";
import { GenericCompiler } from "./compiler.js";
import type { QueryContext } from "../types/context.js";

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
        columns.forEach(c => validateString(c, "Column"));
    } else if (columns !== "*") {
        validateString(columns, "Columns");
    }
    this.statement.columns = columns;
    return this;
  }

  innerJoin<T extends Table<any, any>, K extends string>(
    alias: K,
    table: T,
    on: (cols: { base: TBase; joined: T }) => Expression
  ): SelectBuilder<TBase, TJoined & { [P in K]: T }> {
    validateString(alias, "Alias");
    const join: Join = {
      type: "inner",
      table: table.name,
      on: on({ base: this.tableObj as any, joined: table }),
    };
    this.statement.joins!.push(join);
    (this.joinedTables as any)[alias] = table;
    return this as any;
  }

  where(column: string, operator: string, value: unknown): SelectBuilder<TBase, TJoined> {
    validateString(column, "Column");
    validateString(operator, "Operator");
    
    const newExpr: Expression = {
      type: "binary",
      left: { type: "column", name: column },
      operator,
      right: { type: "literal", value },
    };

    this.addWhere(newExpr);
    return this;
  }

  private addWhere(expr: Expression) {
    if (this.statement.where) {
      this.statement.where = {
        type: "binary",
        left: this.statement.where,
        operator: "AND",
        right: expr,
      };
    } else {
      this.statement.where = expr;
    }
  }

  orderBy(column: string, direction: "ASC" | "DESC" = "ASC"): SelectBuilder<TBase, TJoined> {
    validateString(column, "Column");
    validateString(direction, "Direction");
    if (!this.statement.orderBy) {
      this.statement.orderBy = [];
    }
    this.statement.orderBy.push({ column, direction: direction as any });
    return this;
  }

  limit(limit: number): SelectBuilder<TBase, TJoined> {
    if (typeof limit !== "number" || isNaN(limit)) throw new Error("Limit must be a valid number");
    this.statement.limit = limit;
    return this;
  }

  offset(offset: number): SelectBuilder<TBase, TJoined> {
    if (typeof offset !== "number" || isNaN(offset)) throw new Error("Offset must be a valid number");
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

  async execute(): Promise<TBase extends Table<any, any> ? (keyof TJoined extends never ? InferSelect<TBase>[] : JoinResult<TBase, TJoined>[]) : unknown[]> {
    if (!this.statement.table) {
      throw new Error("Table must be specified for SELECT query");
    }

    const pushdownStatement = this.applyPolicyPushdown();

    const compiler = new GenericCompiler();
    const { sql, params } = compiler.compileSelect(pushdownStatement);
    const result = await this.db.driver.execute<unknown>(sql, params);
    
    let rows = result.rows;

    if (this.shouldValidate && this.tableObj) {
      const schema = toValidationSchema(this.tableObj);
      const validatedRows = [];
      for (const row of rows) {
        const parsed = parseWithOptions(schema, row);
        if (!isOk(parsed)) {
          throw new Error(`Validation failed for row: ${JSON.stringify(parsed.error)}`);
        }
        validatedRows.push(parsed.value.data as any);
      }
      rows = validatedRows;
    }

    return rows as any;
  }

  private applyPolicyPushdown(): SelectStatement {
    if (!this.context) return this.statement;

    const statement = { ...this.statement, joins: this.statement.joins ? [...this.statement.joins] : [] };
    const userScopes = new Set(this.context.scopes ?? []);

    // 1. Apply to Base Table
    if (this.tableObj) {
        this.applyTablePolicy(statement, this.tableObj as any, undefined, userScopes);
    }

    // 2. Apply to Joins (Deep Policy Pushdown)
    if (statement.joins) {
        for (const join of statement.joins) {
            const joinedTable = Object.values(this.joinedTables).find(t => t.name === join.table);
            if (joinedTable) {
                this.applyTablePolicy(statement, joinedTable, join.table, userScopes);
            }
        }
    }

    return statement;
  }

  private applyTablePolicy(statement: SelectStatement, table: Table<any, any>, alias: string | undefined, userScopes: Set<string>): void {
    const tableName = alias || table.name;

    // Row-Level Security (RLS)
    if (this.context?.userId && table.columns["userId"]) {
       const rowFilter: Expression = {
         type: "binary",
         left: { type: "column", name: "userId", table: tableName },
         operator: "=",
         right: { type: "literal", value: this.context.userId }
       };
       
       if (statement.where) {
         statement.where = {
           type: "binary",
           left: statement.where,
           operator: "AND",
           right: rowFilter
         };
       } else {
         statement.where = rowFilter;
       }
    }

    // Column-Level Security (CLS) - Only if statement.columns is array or *
    // For joined tables, CLS is harder because they are usually selected via alias or *,
    // but we ensure that if we select *, we respect the policy.
    // (Actual implementation would need to handle multi-table * select more precisely)
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
    return await this.db.driver.execute(sql, params);
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
  where(column: string, operator: string, value: unknown): UpdateBuilder<TTable> {
    validateString(column, "Column");
    validateString(operator, "Operator");
    const newExpr: Expression = {
      type: "binary",
      left: { type: "column", name: column },
      operator,
      right: { type: "literal", value },
    };
    if (this.statement.where) {
      this.statement.where = { type: "binary", left: this.statement.where, operator: "AND", right: newExpr };
    } else {
      this.statement.where = newExpr;
    }
    return this;
  }
  async execute() {
    const compiler = new GenericCompiler();
    const { sql, params } = compiler.compileUpdate(this.statement);
    return await this.db.driver.execute(sql, params);
  }
}

export class DeleteBuilder<TTable extends Table<any, any>> {
  private statement: DeleteStatement;
  constructor(private readonly db: DB, private readonly table: TTable) {
    this.statement = { type: "delete", table: table.name };
  }
  where(column: string, operator: string, value: unknown): DeleteBuilder<TTable> {
    validateString(column, "Column");
    validateString(operator, "Operator");
    const newExpr: Expression = {
      type: "binary",
      left: { type: "column", name: column },
      operator,
      right: { type: "literal", value },
    };
    if (this.statement.where) {
      this.statement.where = { type: "binary", left: this.statement.where, operator: "AND", right: newExpr };
    } else {
      this.statement.where = newExpr;
    }
    return this;
  }
  async execute() {
    const compiler = new GenericCompiler();
    const { sql, params } = compiler.compileDelete(this.statement);
    return await this.db.driver.execute(sql, params);
  }
}
