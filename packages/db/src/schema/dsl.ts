import type { Expression } from "../builder/ast.js";
import type { QueryContext } from "../types/context.js";
import type { op } from "../builder/expressions.js";

export type ColumnType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "json"
  | "uuid"
  | "enum";

export interface ColumnOptions {
  primaryKey?: boolean | undefined;
  nullable?: boolean | undefined;
  unique?: boolean | undefined;
  index?: boolean | undefined;
  default?: unknown | undefined;
  enumValues?: string[] | undefined;
  references?: {
    table: string;
    column: string;
  } | undefined;
  policy?: {
    pii?: boolean | undefined;
    redact?: "mask" | "hide" | "none" | undefined;
    scope?: string[] | undefined;
  } | undefined;
}

export class ColumnBuilder<
  TType extends ColumnType,
  TNullable extends boolean = false,
> {
  public name?: string; // Set by Table constructor

  constructor(
    public readonly type: TType,
    public readonly options: ColumnOptions = {},
  ) {}

  primary() {
    return new ColumnBuilder<TType, TNullable>(this.type, {
      ...this.options,
      primaryKey: true,
    });
  }

  nullable() {
    return new ColumnBuilder<TType, true>(this.type, {
      ...this.options,
      nullable: true,
    });
  }

  unique() {
    return new ColumnBuilder<TType, TNullable>(this.type, {
      ...this.options,
      unique: true,
    });
  }

  index() {
    return new ColumnBuilder<TType, TNullable>(this.type, {
      ...this.options,
      index: true,
    });
  }

  references(table: string | { name: string }, column: string) {
    return new ColumnBuilder<TType, TNullable>(this.type, {
      ...this.options,
      references: {
        table: typeof table === "string" ? table : table.name,
        column,
      },
    });
  }

  policy(policy: ColumnOptions["policy"]) {
    return new ColumnBuilder<TType, TNullable>(this.type, {
      ...this.options,
      policy,
    });
  }

  default(value: unknown) {
    return new ColumnBuilder<TType, TNullable>(this.type, {
      ...this.options,
      default: value,
    });
  }

  at(path: string): Expression {
    if (this.type !== "json") {
        throw new Error(`Security Exception: .at() can only be called on JSON columns, but "${this.type}" was used.`);
    }
    if (!this.name) {
        throw new Error(`Security Exception: Column name not set. Ensure the table was initialized via table().`);
    }
    // Simple validation of path to prevent injection
    if (!/^[a-zA-Z0-9_.]+$/.test(path)) {
        throw new Error(`Security Exception: Invalid JSON path "${path}". Only alphanumeric, underscores, and dots are allowed.`);
    }

    return {
        type: "function",
        name: "JSON_EXTRACT", 
        args: [
            { type: "column", name: this.name },
            { type: "literal", value: path }
        ]
    };
  }
}

export const column = {
  string: () => new ColumnBuilder("string"),
  number: () => new ColumnBuilder("number"),
  boolean: () => new ColumnBuilder("boolean"),
  uuid: () => new ColumnBuilder("uuid"),
  date: () => new ColumnBuilder("date"),
  json: () => new ColumnBuilder("json"),
  enum: (values: string[]) => new ColumnBuilder("enum", { enumValues: values }),
};

const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export interface RelationDefinition {
  type: "belongsTo" | "hasMany" | "hasOne";
  target: Table<any, any>;
  foreignKey: string;
}

export interface TableOptions {
  policy?: {
    rls?: (ctx: QueryContext, helpers: typeof op) => Expression;
  };
  relations?: Record<string, RelationDefinition>;
}

export class Table<
  TName extends string,
  TColumns extends Record<string, ColumnBuilder<any, any>>,
> {
  constructor(
    public readonly name: TName,
    public readonly columns: TColumns,
    public readonly options: TableOptions = {},
  ) {
    if (!IDENTIFIER_REGEX.test(name)) {
      throw new Error(`Security Exception: Invalid table name "${name}". Identifiers must contain only alphanumeric characters and underscores, and must start with a letter or underscore.`);
    }
    for (const [colName, col] of Object.entries(columns)) {
      if (!IDENTIFIER_REGEX.test(colName)) {
        throw new Error(`Security Exception: Invalid column name "${colName}" in table "${name}". Identifiers must contain only alphanumeric characters and underscores.`);
      }
      col.name = colName;
    }
  }
}

export function table<
  TName extends string,
  TColumns extends Record<string, ColumnBuilder<any, any>>,
>(name: TName, columns: TColumns, options: TableOptions = {}) {
  return new Table(name, columns, options);
}

export function belongsTo(target: Table<any, any>, foreignKey: string): RelationDefinition {
  return { type: "belongsTo", target, foreignKey };
}

export function hasMany(target: Table<any, any>, foreignKey: string): RelationDefinition {
  return { type: "hasMany", target, foreignKey };
}
