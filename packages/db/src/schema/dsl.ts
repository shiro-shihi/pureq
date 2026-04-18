export type ColumnType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "json"
  | "uuid";

export interface ColumnOptions {
  primaryKey?: boolean | undefined;
  nullable?: boolean | undefined;
  default?: unknown | undefined;
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
}

export const column = {
  string: () => new ColumnBuilder("string"),
  number: () => new ColumnBuilder("number"),
  boolean: () => new ColumnBuilder("boolean"),
  uuid: () => new ColumnBuilder("uuid"),
  date: () => new ColumnBuilder("date"),
  json: () => new ColumnBuilder("json"),
};

const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class Table<
  TName extends string,
  TColumns extends Record<string, ColumnBuilder<any, any>>,
> {
  constructor(
    public readonly name: TName,
    public readonly columns: TColumns,
  ) {
    if (!IDENTIFIER_REGEX.test(name)) {
      throw new Error(`Security Exception: Invalid table name "${name}". Identifiers must contain only alphanumeric characters and underscores, and must start with a letter or underscore.`);
    }
    for (const colName of Object.keys(columns)) {
      if (!IDENTIFIER_REGEX.test(colName)) {
        throw new Error(`Security Exception: Invalid column name "${colName}" in table "${name}". Identifiers must contain only alphanumeric characters and underscores.`);
      }
    }
  }
}

export function table<
  TName extends string,
  TColumns extends Record<string, ColumnBuilder<any, any>>,
>(name: TName, columns: TColumns) {
  return new Table(name, columns);
}
