export type Expression =
  | { type: "column"; name: string; table?: string }
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
  columns: string[] | "*";
  joins?: Join[];
  where?: Expression;
  limit?: number;
  offset?: number;
  orderBy?: { column: string; direction: "ASC" | "DESC" }[];
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
  where?: Expression;
}

export interface DeleteStatement {
  type: "delete";
  table: string;
  where?: Expression;
}

export type Statement =
  | SelectStatement
  | InsertStatement
  | UpdateStatement
  | DeleteStatement;
