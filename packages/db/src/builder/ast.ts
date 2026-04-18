export type Expression =
  | { type: "column"; name: string; table?: string | undefined }
  | { type: "literal"; value: unknown }
  | { type: "binary"; left: Expression; operator: string; right: Expression }
  | { type: "function"; name: string; args: Expression[] };

export interface Join {
  type: "inner" | "left" | "right" | "full";
  table: string;
  on: Expression;
}

export interface SelectStatement {
  type: "select";
  table: string;
  columns: (string | Expression)[] | "*";
  joins?: Join[] | undefined;
  where?: Expression | undefined;
  groupBy?: string[] | undefined;
  having?: Expression | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  orderBy?: { column: string; direction: "ASC" | "DESC" }[] | undefined;
}

export interface InsertStatement {
  type: "insert";
  table: string;
  values: Record<string, unknown>;
}

export interface UpdateStatement {
  type: "update";
  table: string;
  values: Record<string, unknown>;
  where?: Expression | undefined;
}

export interface DeleteStatement {
  type: "delete";
  table: string;
  where?: Expression | undefined;
}

export type Statement =
  | SelectStatement
  | InsertStatement
  | UpdateStatement
  | DeleteStatement;
