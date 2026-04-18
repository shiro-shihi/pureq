import type { ColumnBuilder, ColumnType, Table } from "./dsl.js";

export type InferColumnType<T extends ColumnType> = T extends "string"
  ? string
  : T extends "number"
  ? number
  : T extends "boolean"
  ? boolean
  : T extends "uuid"
  ? string
  : T extends "date"
  ? Date
  : T extends "json"
  ? unknown
  : never;

export type InferSelectColumn<T extends ColumnBuilder<any, any>> =
  T extends ColumnBuilder<infer TType, infer TNullable>
    ? TNullable extends true
      ? InferColumnType<TType> | null
      : InferColumnType<TType>
    : never;

export type InferInsertColumn<T extends ColumnBuilder<any, any>> =
  T extends ColumnBuilder<infer TType, infer TNullable>
    ? TNullable extends true
      ? InferColumnType<TType> | null | undefined
      : InferColumnType<TType>
    : never;

export type InferSelect<T extends Table<any, any>> = T extends Table<
  any,
  infer TColumns
>
  ? { [K in keyof TColumns]: InferSelectColumn<TColumns[K]> }
  : never;

export type InferInsert<T extends Table<any, any>> = T extends Table<
  any,
  infer TColumns
>
  ? {
      [K in keyof TColumns as TColumns[K] extends ColumnBuilder<any, any>
        ? TColumns[K]["options"]["nullable"] extends true
          ? never
          : TColumns[K]["options"]["default"] extends undefined
          ? TColumns[K]["options"]["primaryKey"] extends true
            ? never
            : K
          : never
        : never]: InferInsertColumn<TColumns[K]>;
    } & {
      [K in keyof TColumns as TColumns[K] extends ColumnBuilder<any, any>
        ? TColumns[K]["options"]["nullable"] extends true
          ? K
          : TColumns[K]["options"]["default"] extends undefined
          ? TColumns[K]["options"]["primaryKey"] extends true
            ? K
            : never
          : K
        : never]?: InferInsertColumn<TColumns[K]>;
    }
  : never;
